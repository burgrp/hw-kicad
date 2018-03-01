const fs = require("fs");

function generate(name, generator) {

    let lines = [];

    let w = l => {
        console.info(l);
        lines.push(l);
    };

    w(`(module ${name} (layer F.Cu)`);

    w(` (model \${DF}/${name}.wrl`);
    w(`  (at (xyz 0 0 0))`);
    w(`  (scale (xyz 0.393701 0.393701 0.393701))`);
    w(`  (rotate (xyz 0 0 0))`);
    w(` )`);
    
    generator(w, name);
    w(`)`);

    fs.writeFileSync(`${name}.kicad_mod`, lines.join("\n"));    
}

function microMatchFOB(count) {

    generate(`Micro-Match-FOB-${count}`, (w, name) => {

        w(` (fp_text reference REF** (at 0 5) (layer F.SilkS)`);
        w(`  (effects (font (size 1 1) (thickness 0.15)))`);
        w(` )`);
        w(` (fp_text value "${name}" (at 0 -5) (layer F.Fab)`);
        w(`  (effects (font (size 1 1) (thickness 0.15)))`);
        w(` )`);

        for (let p = 0; p < count; p++) {
            let x = p * 1.27 - count * 1.27 / 2 + 1.27 / 2;
            let y = (p % 2 * 2 - 1) * 2.25;
            w(` (pad ${p + 1} smd rect (at ${x} ${y}) (size 1.5 3) (layers F.Cu F.Paste F.Mask))`);
        }

        ox = count / 2 * 1.27 + 0.94;
        oy = 2.5;
        w(` (fp_line (start ${-ox} ${-oy}) (end ${ox} ${-oy}) (layer F.SilkS) (width 0.15))`);
        w(` (fp_line (start ${-ox} ${oy}) (end ${ox} ${oy}) (layer F.SilkS) (width 0.15))`);
        w(` (fp_line (start ${-ox} ${-oy}) (end ${-ox} ${oy}) (layer F.SilkS) (width 0.15))`);
        w(` (fp_line (start ${ox} ${-oy}) (end ${ox} ${oy}) (layer F.SilkS) (width 0.15))`);

        let kx = ox - 0.5;
        let ky = oy - 1;
        w(` (fp_line (start ${-ox} ${-ky}) (end ${-kx} ${-ky}) (layer F.SilkS) (width 0.15))`);
        w(` (fp_line (start ${-kx} ${-ky}) (end ${-kx} ${ky}) (layer F.SilkS) (width 0.15))`);
        w(` (fp_line (start ${-ox} ${ky}) (end ${-kx} ${ky}) (layer F.SilkS) (width 0.15))`);

    });
}

[4, 6].forEach(microMatchFOB);


