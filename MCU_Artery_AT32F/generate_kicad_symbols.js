#!/usr/bin/env node

const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const moduleDir = __dirname;
const repositoryDir = path.resolve(moduleDir, "..");
const outputFile = path.join(repositoryDir, "Artery_MCU.kicad_sym");
const configFile = path.join(__dirname, "kicad_generator_config.json");
const kicadDataDir = process.env.KICAD_DATA_DIR || "/usr/share/kicad";
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));

const GRID = 2.54;
const PIN_LENGTH = 2.54;
const SIDE_CORNER_CLEARANCE = 10.16;
const FIELD_CLEARANCE = 12.7;

function quote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function fmt(value) {
  return Number(value.toFixed(3)).toString();
}

function effects(indent, justify = "") {
  const justification = justify ? `\n${indent}\t(justify ${justify})` : "";
  return `${indent}(effects\n${indent}\t(font\n${indent}\t\t(size 1.27 1.27)\n${indent}\t)${justification}\n${indent})`;
}

function property(name, value, x, y, options = {}) {
  const hidden = options.hidden ? "\n\t\t\t(hide yes)" : "";
  const justify = options.justify || "";
  return `\t\t(property ${quote(name)} ${quote(value)}
\t\t\t(at ${fmt(x)} ${fmt(y)} 0)
\t\t\t(show_name no)
\t\t\t(do_not_autoplace no)${hidden}
${effects("\t\t\t", justify)}
\t\t)`;
}

function normalizeDimension(value) {
  return String(Number(value));
}

function parsePackageTitle(title) {
  const match = title.match(
    /^(LQFP|QFN)-(\d+)_L([\d.]+)-W([\d.]+)-P([\d.]+)/i,
  );
  if (!match) return null;
  const ep = title.match(/-EP([\d.]+)/i);
  return {
    type: match[1].toUpperCase(),
    leads: Number(match[2]),
    length: Number(match[3]),
    width: Number(match[4]),
    pitch: Number(match[5]),
    exposedPad: ep ? Number(ep[1]) : null,
  };
}

function isGround(pin) {
  return /^(VSS|VSSA|GND|AGND|DGND|VREF-)/i.test(pin.name);
}

function isPositivePower(pin) {
  return /^(VDD|VDDA|VBAT|VREF\+|AVDD|DVDD)/i.test(pin.name);
}

function isPower(pin) {
  return isGround(pin) || isPositivePower(pin);
}

function isNoConnect(pin) {
  return /^(NC|N\.C\.)$/i.test(pin.name);
}

function portInfo(pin) {
  const match = pin.name.match(/^P([A-Z])(\d+)$/);
  return match ? { bank: match[1], index: Number(match[2]) } : null;
}

function pinType(pin) {
  if (isNoConnect(pin)) return "no_connect";
  if (isPower(pin)) return "power_in";
  if (/^(N?RST|RESET|BOOT\d*)$/i.test(pin.name)) return "input";
  if (pin.name.endsWith("_IN")) return "input";
  if (pin.name.endsWith("_OUT")) return "output";
  return "bidirectional";
}

function alternateType(name) {
  if (name.endsWith("_IN") || /^BOOT\d*$/i.test(name)) return "input";
  if (name.endsWith("_OUT")) return "output";
  return "bidirectional";
}

function parseSymbol(file) {
  const records = fs
    .readFileSync(file, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const attributes = new Map();

  for (const record of records) {
    if (record[0] !== "ATTR") continue;
    if (!attributes.has(record[2])) attributes.set(record[2], {});
    attributes.get(record[2])[record[3]] = record[4];
  }

  return records
    .filter((record) => record[0] === "PIN")
    .map((record) => {
      const attr = attributes.get(record[1]);
      if (!attr?.NAME || !attr?.NUMBER) {
        throw new Error(`${file}: pin ${record[1]} lacks a name or number`);
      }
      const names = String(attr.NAME).split("/");
      return {
        number: String(attr.NUMBER),
        name: names[0],
        alternates: names.slice(1),
      };
    })
    .sort((a, b) =>
      a.number.localeCompare(b.number, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
}

function findFiles(directory, suffix) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findFiles(entryPath, suffix);
    return entry.name.endsWith(suffix) ? [entryPath] : [];
  });
}

function extractSources() {
  const families = Object.entries(config.families || {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (!families.length) {
    throw new Error("No family download URLs configured");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "artery-kicad-"));
  const devices = [];

  try {
    const releasesDir = path.join(tempDir, "releases");
    fs.mkdirSync(releasesDir);
    const releaseDirectories = [];
    for (const [family, familyConfig] of families) {
      if (!familyConfig.componentLibraryUrl || !familyConfig.datasheetUrl) {
        throw new Error(
          `${family}: componentLibraryUrl and datasheetUrl are required`,
        );
      }
      const archiveFile = path.join(tempDir, `${family}.zip`);
      childProcess.execFileSync("curl", [
        "--fail",
        "--location",
        "--retry",
        "3",
        "--silent",
        "--show-error",
        "--output",
        archiveFile,
        familyConfig.componentLibraryUrl,
      ]);
      const destination = path.join(releasesDir, family);
      fs.mkdirSync(destination);
      childProcess.execFileSync("unzip", [
        "-q",
        archiveFile,
        "-d",
        destination,
      ]);
      releaseDirectories.push({
        family,
        datasheetUrl: familyConfig.datasheetUrl,
        directory: destination,
      });
    }

    const componentArchives = findFiles(releasesDir, ".elibz").sort();
    if (!componentArchives.length) {
      throw new Error("Manufacturer release ZIP files contain no .elibz libraries");
    }

    for (const componentArchive of componentArchives) {
      const archiveName = path.basename(componentArchive);
      const release = releaseDirectories.find(
        ({ directory }) =>
          componentArchive === directory ||
          componentArchive.startsWith(`${directory}${path.sep}`),
      );
      if (!release) {
        throw new Error(`${componentArchive}: cannot determine source family`);
      }
      const destination = path.join(
        tempDir,
        "components",
        path.basename(archiveName, ".elibz"),
      );
      fs.mkdirSync(destination, { recursive: true });
      childProcess.execFileSync("unzip", [
        "-q",
        componentArchive,
        "-d",
        destination,
      ]);
      const deviceJson = JSON.parse(
        fs.readFileSync(path.join(destination, "device.json"), "utf8"),
      );
      const device = Object.values(deviceJson.devices)[0];
      const symbolDir = path.join(destination, "SYMBOL");
      const symbolFile = fs
        .readdirSync(symbolDir)
        .find((entry) => entry.endsWith(".esym"));
      if (!device || !symbolFile) {
        throw new Error(`${archiveName}: missing device or symbol data`);
      }
      const name = device.display_title || path.basename(archiveName, ".elibz");
      if (!name.startsWith(release.family)) {
        throw new Error(
          `${archiveName}: device ${name} does not belong to ${release.family}`,
        );
      }

      devices.push({
        name,
        manufacturer: device.attributes?.Manufacturer || "Artery Technology",
        packageTitle: device.footprint?.display_title,
        datasheetUrl: release.datasheetUrl,
        pins: parseSymbol(path.join(symbolDir, symbolFile)),
      });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return devices;
}

function findQfnFootprint(packageInfo) {
  const directory = path.join(kicadDataDir, "footprints", "Package_DFN_QFN.pretty");
  const prefix =
    `QFN-${packageInfo.leads}-1EP_` +
    `${normalizeDimension(packageInfo.length)}x${normalizeDimension(packageInfo.width)}mm_` +
    `P${normalizeDimension(packageInfo.pitch)}mm_EP`;
  const candidates = fs
    .readdirSync(directory)
    .filter(
      (entry) =>
        entry.startsWith(prefix) &&
        entry.endsWith(".kicad_mod") &&
        !entry.includes("_ThermalVias"),
    )
    .map((entry) => {
      const match = entry.match(/_EP([\d.]+)x([\d.]+)mm\.kicad_mod$/);
      if (!match) return null;
      const epX = Number(match[1]);
      const epY = Number(match[2]);
      const target = packageInfo.exposedPad ?? (epX + epY) / 2;
      return {
        entry,
        score: Math.abs(epX - target) + Math.abs(epY - target),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.entry.localeCompare(b.entry));

  if (!candidates.length) return null;
  return `Package_DFN_QFN:${candidates[0].entry.replace(/\.kicad_mod$/, "")}`;
}

function resolveFootprint(device) {
  const override = config.footprintOverrides[device.name];
  if (override) return override;

  const packageInfo = parsePackageTitle(device.packageTitle || "");
  if (!packageInfo) {
    throw new Error(
      `${device.name}: unsupported package ${quote(device.packageTitle)}; ` +
        "add footprintOverrides entry to kicad_generator_config.json",
    );
  }

  if (packageInfo.type === "LQFP") {
    const footprint =
      `LQFP-${packageInfo.leads}_` +
      `${normalizeDimension(packageInfo.length)}x${normalizeDimension(packageInfo.width)}mm_` +
      `P${normalizeDimension(packageInfo.pitch)}mm`;
    const file = path.join(
      kicadDataDir,
      "footprints",
      "Package_QFP.pretty",
      `${footprint}.kicad_mod`,
    );
    if (fs.existsSync(file)) return `Package_QFP:${footprint}`;
  }

  if (packageInfo.type === "QFN") {
    const footprint = findQfnFootprint(packageInfo);
    if (footprint) return footprint;
  }

  throw new Error(
    `${device.name}: no standard KiCad footprint found for ${device.packageTitle}; ` +
      "add footprintOverrides entry to kicad_generator_config.json",
  );
}

function footprintFilter(footprint) {
  return footprint
    .split(":")[1]
    .replaceAll("_", "*")
    .replace(/EP[\d.]+x[\d.]+mm/, "EP*");
}

function validateDevice(device) {
  if (!device.pins.length) throw new Error(`${device.name}: symbol has no pins`);
  const numbers = new Set(device.pins.map((pin) => pin.number));
  if (numbers.size !== device.pins.length) {
    throw new Error(`${device.name}: duplicate pin number`);
  }

  const packageInfo = parsePackageTitle(device.packageTitle || "");
  if (packageInfo && device.pins.length < packageInfo.leads) {
    throw new Error(
      `${device.name}: ${device.pins.length} symbol pins for ${packageInfo.leads}-lead package`,
    );
  }

  for (const [number, expectedName] of Object.entries(
    config.pinAssertions[device.name] || {},
  )) {
    const pin = device.pins.find((candidate) => candidate.number === number);
    if (!pin || pin.name !== expectedName) {
      throw new Error(
        `${device.name}: pin ${number} must be ${expectedName}, found ${pin?.name || "missing"}`,
      );
    }
  }
}

function renderPin(pin, x, y, rotation, indent = "\t\t\t") {
  const type = pinType(pin);
  const alternates = pin.alternates
    .map(
      (name) =>
        `\n${indent}\t(alternate ${quote(name)} ${alternateType(name)} line)`,
    )
    .join("");
  return `${indent}(pin ${type} line
${indent}\t(at ${fmt(x)} ${fmt(y)} ${rotation})
${indent}\t(length ${fmt(PIN_LENGTH)})
${indent}\t(name ${quote(pin.name)}
${effects(`${indent}\t\t`)}
${indent}\t)
${indent}\t(number ${quote(pin.number)}
${effects(`${indent}\t\t`)}
${indent}\t)${alternates}
${indent})`;
}

function rectangle(halfWidth, top, bottom, indent = "\t\t\t") {
  return `${indent}(rectangle
${indent}\t(start ${fmt(-halfWidth)} ${fmt(top)})
${indent}\t(end ${fmt(halfWidth)} ${fmt(bottom)})
${indent}\t(stroke
${indent}\t\t(width 0.254)
${indent}\t\t(type default)
${indent}\t)
${indent}\t(fill
${indent}\t\t(type background)
${indent}\t)
${indent})`;
}

function symbolProperties(
  device,
  symbolName,
  footprint,
  fieldY,
  halfWidth,
  stackFields = false,
) {
  const packageInfo = parsePackageTitle(device.packageTitle || "");
  const packageDescription = packageInfo
    ? `${packageInfo.type}-${packageInfo.leads}`
    : device.packageTitle;
  const description =
    `${device.manufacturer} ${device.name} MCU, ${packageDescription}; ` +
    "pin mapping from the supplied JLCEDA library";

  const reference = property("Reference", "U", -halfWidth, fieldY, {
    justify: "left",
  });
  const value = stackFields
    ? property("Value", symbolName, -halfWidth, fieldY - GRID, {
        justify: "left",
      })
    : property("Value", symbolName, halfWidth, fieldY, { justify: "right" });

  return `${reference}
${value}
${property("Footprint", footprint, 0, 0, { hidden: true })}
${property("Datasheet", device.datasheetUrl, 0, 0, { hidden: true })}
${property("Description", description, 0, 0, { hidden: true })}
${property("ki_keywords", "Artery AT32 ARM Cortex MCU", 0, 0, { hidden: true })}
${property("ki_fp_filters", footprintFilter(footprint), 0, 0, { hidden: true })}`;
}

function spread(items, minimumSpan = 0) {
  if (!items.length) return [];
  const naturalSpan = (items.length - 1) * GRID;
  const spacing =
    items.length > 1 ? Math.max(GRID, minimumSpan / (items.length - 1)) : GRID;
  return items.map((_, index) => (index - (items.length - 1) / 2) * spacing);
}

function groupedSideRows(pins) {
  const gpioGroups = new Map();
  const support = [];

  for (const pin of pins) {
    const port = portInfo(pin);
    if (!port) {
      support.push(pin);
      continue;
    }
    if (!gpioGroups.has(port.bank)) gpioGroups.set(port.bank, []);
    gpioGroups.get(port.bank).push(pin);
  }
  for (const group of gpioGroups.values()) {
    group.sort((a, b) => portInfo(a).index - portInfo(b).index);
  }

  const leftGroups = support.length ? [support] : [];
  const rightGroups = [];
  let leftRows = support.length;
  let rightRows = 0;
  for (const bank of [...gpioGroups.keys()].sort()) {
    const group = gpioGroups.get(bank);
    if (leftRows <= rightRows) {
      leftGroups.push(group);
      leftRows += group.length + 1;
    } else {
      rightGroups.push(group);
      rightRows += group.length + 1;
    }
  }

  const flatten = (groups) => {
    const rows = [];
    for (const group of groups) {
      if (rows.length) rows.push(null);
      rows.push(...group);
    }
    return rows;
  };
  return { left: flatten(leftGroups), right: flatten(rightGroups) };
}

function renderCompleteSymbol(device, footprint) {
  const symbolName = device.name;
  const positivePower = device.pins.filter(isPositivePower);
  const ground = device.pins.filter(isGround);
  const sidePins = device.pins.filter((pin) => !isPower(pin));
  const rows = groupedSideRows(sidePins);
  const rowCount = Math.max(rows.left.length, rows.right.length, 12);
  const powerCount = Math.max(positivePower.length, ground.length);
  const width = Math.max(35.56, (powerCount - 1) * GRID + 2 * SIDE_CORNER_CLEARANCE);
  const halfWidth = Math.ceil(width / (2 * GRID)) * GRID;
  const usableSideHeight = Math.max(0, rowCount - 1) * GRID;
  const halfHeight =
    Math.ceil((usableSideHeight + 2 * SIDE_CORNER_CLEARANCE) / (2 * GRID)) * GRID;
  const top = halfHeight;
  const bottom = -halfHeight;
  const startY = top - SIDE_CORNER_CLEARANCE;
  const renderedPins = [];

  rows.left.forEach((pin, index) => {
    if (pin) {
      renderedPins.push(
        renderPin(pin, -halfWidth - PIN_LENGTH, startY - index * GRID, 0),
      );
    }
  });
  rows.right.forEach((pin, index) => {
    if (pin) {
      renderedPins.push(
        renderPin(pin, halfWidth + PIN_LENGTH, startY - index * GRID, 180),
      );
    }
  });
  spread(positivePower).forEach((x, index) => {
    renderedPins.push(renderPin(positivePower[index], x, top + PIN_LENGTH, 270));
  });
  spread(ground).forEach((x, index) => {
    renderedPins.push(renderPin(ground[index], x, bottom - PIN_LENGTH, 90));
  });

  return `\t(symbol ${quote(symbolName)}
\t\t(exclude_from_sim no)
\t\t(in_bom yes)
\t\t(on_board yes)
\t\t(in_pos_files yes)
\t\t(duplicate_pin_numbers_are_jumpers no)
${symbolProperties(device, symbolName, footprint, top + FIELD_CLEARANCE, halfWidth)}
\t\t(embedded_fonts no)
\t\t(symbol ${quote(`${symbolName}_0_1`)}
${rectangle(halfWidth, top, bottom)}
\t\t)
\t\t(symbol ${quote(`${symbolName}_1_1`)}
${renderedPins.join("\n")}
\t\t)
\t)`;
}

function renderSupportUnit(symbolName, pins, unitNumber) {
  const positivePower = pins.filter(isPositivePower);
  const ground = pins.filter(isGround);
  const sidePins = pins.filter((pin) => !isPower(pin));
  const left = sidePins.filter((_, index) => index % 2 === 0);
  const right = sidePins.filter((_, index) => index % 2 === 1);
  const rowCount = Math.max(left.length, right.length, 4);
  const powerCount = Math.max(positivePower.length, ground.length);
  const width = Math.max(25.4, (powerCount - 1) * GRID + 10.16);
  const halfWidth = Math.ceil(width / (2 * GRID)) * GRID;
  const halfHeight = Math.max(10.16, Math.ceil(((rowCount + 1) * GRID) / (2 * GRID)) * GRID);
  const top = halfHeight;
  const bottom = -halfHeight;
  const startY = ((left.length - 1) * GRID) / 2;
  const rightStartY = ((right.length - 1) * GRID) / 2;
  const renderedPins = [];

  left.forEach((pin, index) => {
    renderedPins.push(
      renderPin(pin, -halfWidth - PIN_LENGTH, startY - index * GRID, 0),
    );
  });
  right.forEach((pin, index) => {
    renderedPins.push(
      renderPin(pin, halfWidth + PIN_LENGTH, rightStartY - index * GRID, 180),
    );
  });
  spread(positivePower).forEach((x, index) => {
    renderedPins.push(renderPin(positivePower[index], x, top + PIN_LENGTH, 270));
  });
  spread(ground).forEach((x, index) => {
    renderedPins.push(renderPin(ground[index], x, bottom - PIN_LENGTH, 90));
  });

  return `\t\t(symbol ${quote(`${symbolName}_${unitNumber}_1`)}
\t\t\t(unit_name "Power / Control")
${rectangle(halfWidth, top, bottom)}
${renderedPins.join("\n")}
\t\t)`;
}

function renderPortUnit(symbolName, bank, pins, unitNumber) {
  const sorted = [...pins].sort((a, b) => portInfo(a).index - portInfo(b).index);
  const split = Math.ceil(sorted.length / 2);
  const left = sorted.slice(0, split);
  const right = sorted.slice(split);
  const halfWidth = 10.16;
  const rowCount = Math.max(left.length, right.length, 4);
  const halfHeight = Math.ceil(((rowCount + 2) * GRID) / (2 * GRID)) * GRID;
  const top = halfHeight;
  const bottom = -halfHeight;
  const renderedPins = [];

  left.forEach((pin, index) => {
    const y = ((left.length - 1) / 2 - index) * GRID;
    renderedPins.push(renderPin(pin, -halfWidth - PIN_LENGTH, y, 0));
  });
  right.forEach((pin, index) => {
    const y = ((right.length - 1) / 2 - index) * GRID;
    renderedPins.push(renderPin(pin, halfWidth + PIN_LENGTH, y, 180));
  });

  return `\t\t(symbol ${quote(`${symbolName}_${unitNumber}_1`)}
\t\t\t(unit_name ${quote(`Port ${bank}`)})
${rectangle(halfWidth, top, bottom)}
${renderedPins.join("\n")}
\t\t)`;
}

function renderMultiUnitSymbol(device, footprint) {
  const symbolName = `${device.name}_MultiUnit`;
  const ports = new Map();
  const supportPins = [];

  for (const pin of device.pins) {
    const port = portInfo(pin);
    if (!port) {
      supportPins.push(pin);
      continue;
    }
    if (!ports.has(port.bank)) ports.set(port.bank, []);
    ports.get(port.bank).push(pin);
  }

  const units = [renderSupportUnit(symbolName, supportPins, 1)];
  let unitNumber = 2;
  for (const bank of [...ports.keys()].sort()) {
    units.push(renderPortUnit(symbolName, bank, ports.get(bank), unitNumber));
    unitNumber += 1;
  }

  const fieldHalfWidth = 15.24;
  return `\t(symbol ${quote(symbolName)}
\t\t(exclude_from_sim no)
\t\t(in_bom yes)
\t\t(on_board yes)
\t\t(in_pos_files yes)
\t\t(duplicate_pin_numbers_are_jumpers no)
${symbolProperties(device, symbolName, footprint, 22.86, fieldHalfWidth, true)}
\t\t(embedded_fonts no)
${units.join("\n")}
\t)`;
}

const devices = extractSources();
for (const device of devices) {
  validateDevice(device);
  device.footprint = resolveFootprint(device);
}

const renderedSymbols = devices.flatMap((device) => [
  renderCompleteSymbol(device, device.footprint),
  renderMultiUnitSymbol(device, device.footprint),
]);
const library = `(kicad_symbol_lib
\t(version 20251024)
\t(generator "artery-jlceda-to-kicad")
\t(generator_version "2.0")
${renderedSymbols.join("\n")}
)
`;

fs.writeFileSync(outputFile, library);

console.log(
  `Generated ${outputFile}: ${devices.length} variants, ${renderedSymbols.length} symbols`,
);
