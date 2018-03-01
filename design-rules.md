# KiCAD 

## Design Rules

### Net Classes Editor

~~~
        Clear Track ViaDia ViaDrill
Default  0.2   0.4   0.6     0.4
~~~

### Global Design Rules

Custom Via Sizes:

~~~
   Dia  Drill
1. 0.9  0.6    Power supply
2. 3    1      Main Lines / Terminal Blocks (5 for high current switching boards)
3. 4    2.2    Screw holes (5/3.8 for bigger boards)
~~~

Custom Track Widths

~~~
1. 0.6 Power supply
2. 3   Main Lines (5 for high current switching boards)
~~~

## Grid Properties

Grid 1 - 0.5mm
Grid 2 - 1mm

## Silk screen

* Address label: line 10mm x 40mm
* OSHW-Logo_11.4x12mm_SilkScreen
* "DEVICE.FARM"  
* "CC-BY-SA"
* name + version

# Onshape

## Dimensions

### Ki-CAD import

* Minimum drill 0.4mm
* Solder mask color: #111111

### Common variables

* w 1.5mm wall thickness
* pp 0.1mm plastics to plastics clearance
* pb 0.2mm plastics to board clearance
* shd 4.2mm screw head dia
* shh 1.8mm screw head height
* sfd 2.8mm screw free dia
* std 1.8mm screw thread dia

### Screw holes
~~~
Counter bore blind in last - #sfd #shd #shh #std ?
~~~

### Clearings
~~~
Plastics to Plastics  0.1mm 
Plastics to Board     0.2mm
~~~

### Wall Thickness
1.2 - 1.8mm

## Document folders

### ROOT
* __ASSEMBLY__ - Comlete assembly with Default and Exploded positions
* __PCB__ - Bare PCB assembly


### Views
* __ACCS__ - Accessories lineup
* __DIM-ALL__ - Complete assembly drawing with dimensions
* __DIM-PCB__ - PCB only drawing with dimensions

### Design

* __pcb__ - PCB model (KiCAD import)
* __parts__ - main working part studio
* ... and any other necessary studios and assemblies

### 3DP
* __3DP__ - part studio with derived printable parts rotaded to reccomended print positions
* __3DP Support__ - derived from 3DP with added supports, mouse ears etc...

## Colors
* Traffic White: RAL 9016, #f1f0ea
* Luminous Red: RAL 3024, #ff2d21
* Traffic Yellow: RAL 1023, #f7b500
* Sky Blue: RAL 5015, #007cb0
* Iron Gray: RAL 7011, #52595d
* Cable E #61ff01
* Cable L #707070
* Cable N #2395fb

# Prodct catalog

## Images

* OnShape __ASSEMBLY__ Default positions
* OnShape __ASSEMBLY__ Exploded positions
* OnShape __PCB__
* OnShape all from __Views__ folder
* __KiCAD__ Schematics of all modules