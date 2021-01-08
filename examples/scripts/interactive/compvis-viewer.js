function addElement (el) {
  Object.assign(el.style, {
    position: 'absolute',
    zIndex: 10
  })
  stage.viewer.container.appendChild(el)
}

function createElement (name, properties, style) {
  var el = document.createElement(name)
  Object.assign(el, properties)
  Object.assign(el.style, style)
  return el
}

function createSelect (options, properties, style) {
  var select = createElement('select', properties, style)
  options.forEach(function (d) {
    select.add(createElement('option', {
      value: d[0], text: d[1]
    }))
  })
  return select
}

function createFileButton (label, properties, style) {
  var input = createElement('input', Object.assign({
    type: 'file'
  }, properties), { display: 'none' })
  addElement(input)
  var button = createElement('input', {
    value: label,
    type: 'button',
    onclick: function () { input.click() }
  }, style)
  return button
}

var topPosition = 12

function getTopPosition (increment) {
  if (increment) topPosition += increment
  return topPosition + 'px'
}

var tooltip = document.createElement('div')
Object.assign(tooltip.style, {
  display: 'none',
  position: 'fixed',
  zIndex: 10,
  pointerEvents: 'none',
  backgroundColor: 'rgba( 0, 0, 0, 0.6 )',
  color: 'lightgrey',
  padding: '8px',
  fontFamily: 'sans-serif'
})
document.body.appendChild(tooltip)

// remove default hoverPick mouse action
stage.mouseControls.remove('hoverPick')
// listen to `hovered` signal to move tooltip around and change its text
stage.signals.hovered.add(function (pickingProxy) {
  if (cartoonCheckbox.checked === true || customCheckbox.checked === true) {
    if (pickingProxy && (pickingProxy.atom || pickingProxy.bond)) {
      var atom = pickingProxy.atom || pickingProxy.closestBondAtom
      // var mp = pickingProxy.mouse.position
      // console.log('pick', pickingProxy.atom.resno)
      var index = atom.resno - firstResNum
      if (index < csv.length && atom.resno >= firstResNum) {
        tooltip.innerHTML = `
      RESNO: ${atom.resno}<br/>
      WT AA: ${atom.resname}<br/>
      WT PROB: ${csv[index][csvWtProbCol]}<br/>
      PRED AA: ${csv[index][csvPrAaCol]}<br/>
      PRED PROB: ${csv[index][csvPrProbCol]}<br/>`
        tooltip.style.bottom = 3 + 'px'
        tooltip.style.left = stage.viewer.width - 200 + 'px'
        tooltip.style.display = 'block'
      } else {
        tooltip.style.display = 'none'
      }
    }
  }
})

function getGradientColor (startColor, endColor, thirdColor, percent) {
  // switch for second gradient i.e white to red for heat map
  if (percent >= 1) {
    percent -= 1
    startColor = endColor
    endColor = thirdColor
  }

  // get colors
  var startRed = parseInt(startColor.substr(0, 2), 16)
  var startGreen = parseInt(startColor.substr(2, 2), 16)
  var startBlue = parseInt(startColor.substr(4, 2), 16)

  var endRed = parseInt(endColor.substr(0, 2), 16)
  var endGreen = parseInt(endColor.substr(2, 2), 16)
  var endBlue = parseInt(endColor.substr(4, 2), 16)

  // calculate new color
  var diffRed = endRed - startRed
  var diffGreen = endGreen - startGreen
  var diffBlue = endBlue - startBlue

  diffRed = ((diffRed * percent) + startRed).toString(16).split('.')[0]
  diffGreen = ((diffGreen * percent) + startGreen).toString(16).split('.')[0]
  diffBlue = ((diffBlue * percent) + startBlue).toString(16).split('.')[0]

  // ensure 2 digits by color (necessary)
  if (diffRed.length === 1) diffRed = '0' + diffRed
  if (diffGreen.length === 1) diffGreen = '0' + diffGreen
  if (diffBlue.length === 1) diffBlue = '0' + diffBlue

  return '0x' + diffRed + diffGreen + diffBlue
}

function makeGradientArray () {
  var gradientArray = []
  for (var count = 0; count < 101; count++) {
    var newColor = getGradientColor('FF0000', 'FFFFFF', '0000FF', (0.02 * count))
    var numColor = parseInt(Number(newColor), 10)
    gradientArray.push(numColor)
  }
  return gradientArray
}

var gradientArray = makeGradientArray()

// var ligandSele = '( not polymer or not ( protein or nucleic ) ) and not ( water or ACE or NH2 )'

var pocketRadius = 0
var pocketRadiusClipFactor = 1

var cartoonRepr, spacefillRepr, neighborRepr, ligandRepr, contactRepr, pocketRepr, labelRepr, customRepr

var heatMap, customPercent

var struc
var csv
var neighborSele
var sidechainAttached = false

const csvResNumCol = 4
const csvWtProbCol = 7
const csvPrAaCol = 6
const csvPrProbCol = 8

var firstResNum

function loadStructure (proteinFile, csvFile) {
  struc = undefined
  stage.setFocus(0)
  stage.removeAllComponents()
  clipNearRange.value = 0
  clipRadiusRange.value = 100
  pocketOpacityRange.value = 0
  cartoonCheckbox.checked = true
  customCheckbox.checked = false
  hydrophobicCheckbox.checked = false
  hydrogenBondCheckbox.checked = true
  weakHydrogenBondCheckbox.checked = false
  waterHydrogenBondCheckbox.checked = true
  backboneHydrogenBondCheckbox.checked = true
  halogenBondCheckbox.checked = true
  metalInteractionCheckbox.checked = true
  saltBridgeCheckbox.checked = true
  cationPiCheckbox.checked = true
  piStackingCheckbox.checked = true
  return Promise.all([
    stage.loadFile(proteinFile, { defaultRepresentation: true }),
    NGL.autoLoad(csvFile, {
      ext: 'csv',
      delimiter: ' ',
      comment: '#',
      columnNames: true
    })
  ]).then(function (ol) {
    struc = ol[0]
    csv = ol[1].data

    firstResNum = parseInt(csv[0][csvResNumCol])

    heatMap = NGL.ColormakerRegistry.addScheme(function (params) {
      this.atomColor = function (atom) {
        for (var i = 0; i <= csv.length; i++) {
          const wtProb = parseFloat(csv[i][csvWtProbCol])
          const resNum = parseFloat(csv[i][csvResNumCol])

          const normWtProb = (wtProb * 100).toFixed(0)

          if (atom.resno === resNum) {
            return gradientArray[normWtProb]
          }
        }
      }
    })

    customPercent = NGL.ColormakerRegistry.addScheme(function (params) {
      this.atomColor = function (atom) {
        for (var i = 0; i <= csv.length; i++) {
          const predProb = parseFloat(csv[i][csvPrProbCol])
          const wtProb = parseFloat(csv[i][csvWtProbCol])
          const resNum = parseFloat(csv[i][csvResNumCol])

          if (atom.resno === resNum) {
            if (wtProb < 0.01 && predProb > 0.7) {
              return 0xFF0080// hot pink
            } else if (wtProb < 0.01) {
              return 0xCC00FF // hot pink
            } else if (parseFloat(csv[i][7] < 0.05)) {
              return 0xFF0000 // red
            } else if (wtProb < 0.10) {
              return 0xFFA500 // orange
            } else if (wtProb < 0.25) {
              return 0xFFFF00 // yellow
            } else {
              return 0xFFFFFF // white
            }
          }
        }
      }
    })

    struc.autoView()
    cartoonRepr = struc.addRepresentation('cartoon', {
      color: heatMap,
      visible: true
    })
    customRepr = struc.addRepresentation('cartoon', {
      color: customPercent,
      visible: false
    })
    neighborRepr = struc.addRepresentation('ball+stick', {
      sele: 'none',
      aspectRatio: 1.1,
      colorValue: 'lightgrey',
      multipleBond: 'symmetric'
    })
    ligandRepr = struc.addRepresentation('ball+stick', {
      multipleBond: 'symmetric',
      colorValue: 'grey',
      sele: 'none',
      aspectRatio: 1.1,
      radiusScale: 2.5
    })
    contactRepr = struc.addRepresentation('contact', {
      sele: 'none',
      radiusSize: 0.07,
      weakHydrogenBond: false,
      waterHydrogenBond: false,
      backboneHydrogenBond: true
    })
    pocketRepr = struc.addRepresentation('surface', {
      sele: 'none',
      lazy: true,
      visibility: true,
      clipNear: 0,
      opaqueBack: false,
      opacity: 0.0,
      color: heatMap,
      roughness: 1.0,
      surfaceType: 'av'
    })
    labelRepr = struc.addRepresentation('label', {
      sele: 'none',
      color: '#111111',
      yOffset: 0.2,
      zOffset: 2.0,
      attachment: 'bottom-center',
      showBorder: true,
      borderColor: 'lightgrey',
      borderWidth: 0.5,
      disablePicking: true,
      radiusType: 'size',
      radiusSize: 1.5,
      labelType: 'residue',
      labelGrouping: 'residue'
    })
  })
}

var instructionsText = createElement('span', {
  innerHTML: `
  This tool is for rendering Machine Learning data on proteins. <br/>
  To use with your own Machine Learning CSV: <br/>
  Copy the column order of data/machineLearning/2isk.csv in the source code<br/>
  Then load your local structure and csv files.
  `
}, { top: getTopPosition(), left:'12px', color: 'grey'})
addElement(instructionsText)

var loadStrucFile, loadCsvFile
var loadStructureButton = createFileButton('Load Structure 1st', {
  accept: '.pdb,.cif,.ent,.gz,.mol2',
  onchange: function (e) {
    if (e.target.files[0]) {
      loadStrucFile = e.target.files[0]
    }
  }
}, { top: getTopPosition(70), left: '12px' })
addElement(loadStructureButton)

var loadCsvButton = createFileButton('Load csv 2nd', {
  accept: '.csv',
  onchange: function (e) {
    if (e.target.files[0]) {
      loadCsvFile = e.target.files[0]
      loadStructure(loadStrucFile,loadCsvFile)
      loadCsvFile = ''
      loadStrucFile = ''
    }
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(loadCsvButton)

function showFull () {
  ligandRepr.setVisibility(false)
  neighborRepr.setVisibility(false)
  contactRepr.setVisibility(false)
  pocketRepr.setVisibility(false)
  labelRepr.setVisibility(false)

  struc.autoView(2000)
}



function showLigand (sele) {
  var s = struc.structure

  var withinSele = s.getAtomSetWithinSelection(new NGL.Selection(sele), 9)
  var withinGroup = s.getAtomSetWithinGroup(withinSele)
  var expandedSele = withinGroup.toSeleString()
  neighborSele = '(' + expandedSele + ') and not (' + sele + ')'
  neighborSele = expandedSele

  var sview = s.getView(new NGL.Selection(sele))
  pocketRadius = Math.max(sview.boundingBox.getSize(new NGL.Vector3()).length() / 2, 2) + 10
  var withinSele2 = s.getAtomSetWithinSelection(new NGL.Selection(sele), pocketRadius + 2)
  var neighborSele2 = '(' + withinSele2.toSeleString() + ') and not (' + sele + ') and polymer'

  ligandRepr.setVisibility(true)
  neighborRepr.setVisibility(true)
  contactRepr.setVisibility(true)
  pocketRepr.setVisibility(true)
  labelRepr.setVisibility(labelCheckbox.checked)

  ligandRepr.setSelection(sele)
  neighborRepr.setSelection(
    sidechainAttached ? '(' + neighborSele + ') and (sidechainAttached or not polymer)' : neighborSele
  )
  contactRepr.setSelection(expandedSele)
  pocketRepr.setSelection(neighborSele2)
  pocketRepr.setParameters({
    clipRadius: pocketRadius * pocketRadiusClipFactor,
    clipCenter: sview.center
  })
  labelRepr.setSelection('(' + neighborSele + ') and not (water or ion)')

  struc.autoView(expandedSele, 2000)
}

function showRegion (sele) {
  var s = struc.structure

  var withinSele = s.getAtomSetWithinSelection(new NGL.Selection(sele), 5)
  var withinGroup = s.getAtomSetWithinGroup(withinSele)
  var expandedSele = withinGroup.toSeleString()
  neighborSele = '(' + expandedSele + ') and not (' + sele + ')'
  neighborSele = expandedSele

  ligandRepr.setVisibility(false)
  neighborRepr.setVisibility(false)
  contactRepr.setVisibility(false)
  pocketRepr.setVisibility(false)
  labelRepr.setVisibility(false)

  struc.autoView(expandedSele, 2000)
}

// onclick residue select and show ligand
var prevSele = ''
stage.signals.clicked.add(function (pickingProxy) {
  if (pickingProxy === undefined) {
    showFull()
  }
  if (pickingProxy !== undefined) {
    var sele = ''
    if (pickingProxy.closestBondAtom) {
      sele = ''
      return
    }
    if (pickingProxy.atom.resno !== undefined) {
      sele += (pickingProxy.closestBondAtom || pickingProxy.atom.resno)
    }
    if (pickingProxy.atom.chainname) {
      sele += ':' + (pickingProxy.closestBondAtom || pickingProxy.atom.chainname)
    }
    if (!sele) {
      showFull()
    }
    if (sele !== prevSele) {
      showLigand(sele)
      prevSele = sele
    } else if (sele === prevSele) {
      showRegion(sele)
      prevSele = ''
    }
  }
})

addElement(createElement('span', {
  innerText: 'pocket near clipping'
}, { top: getTopPosition(20), left: '12px', color: 'grey' }))
var clipNearRange = createElement('input', {
  type: 'range', value: 0, min: 0, max: 10000, step: 1
}, { top: getTopPosition(16), left: '12px' })
clipNearRange.oninput = function (e) {
  var sceneRadius = stage.viewer.boundingBox.getSize(new NGL.Vector3()).length() / 2

  var f = pocketRadius / sceneRadius
  var v = parseFloat(e.target.value) / 10000 // must be between 0 and 1
  var c = 0.5 - f / 2 + v * f

  pocketRepr.setParameters({
    clipNear: c * 100 // must be between 0 and 100
  })
}
addElement(clipNearRange)

addElement(createElement('span', {
  innerText: 'pocket radius clipping'
}, { top: getTopPosition(20), left: '12px', color: 'grey' }))
var clipRadiusRange = createElement('input', {
  type: 'range', value: 100, min: 1, max: 100, step: 1
}, { top: getTopPosition(16), left: '12px' })
clipRadiusRange.oninput = function (e) {
  pocketRadiusClipFactor = parseFloat(e.target.value) / 100
  pocketRepr.setParameters({ clipRadius: pocketRadius * pocketRadiusClipFactor })
}
addElement(clipRadiusRange)

addElement(createElement('span', {
  innerText: 'pocket opacity'
}, { top: getTopPosition(20), left: '12px', color: 'grey' }))
var pocketOpacityRange = createElement('input', {
  type: 'range', value: 90, min: 0, max: 100, step: 1
}, { top: getTopPosition(16), left: '12px' })
pocketOpacityRange.oninput = function (e) {
  pocketRepr.setParameters({
    opacity: parseFloat(e.target.value) / 100
  })
}
addElement(pocketOpacityRange)

var cartoonCheckbox = createElement('input', {
  type: 'checkbox',
  checked: false,
  onchange: function (e) {
    cartoonRepr.setVisibility(e.target.checked)
  }
}, { top: getTopPosition(30), left: '12px' })
addElement(cartoonCheckbox)
addElement(createElement('span', {
  innerText: 'Heat Map'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var customCheckbox = createElement('input', {
  type: 'checkbox',
  checked: false,
  onchange: function (e) {
    customRepr.setVisibility(e.target.checked)
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(customCheckbox)
addElement(createElement('span', {
  innerText: 'Custom'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var labelCheckbox = createElement('input', {
  type: 'checkbox',
  checked: true,
  onchange: function (e) {
    labelRepr.setVisibility(e.target.checked)
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(labelCheckbox)
addElement(createElement('span', {
  innerText: 'label'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var hydrophobicCheckbox = createElement('input', {
  type: 'checkbox',
  checked: false,
  onchange: function (e) {
    contactRepr.setParameters({ hydrophobic: e.target.checked })
  }
}, { top: getTopPosition(30), left: '12px' })
addElement(hydrophobicCheckbox)
addElement(createElement('span', {
  innerText: 'hydrophobic'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var hydrogenBondCheckbox = createElement('input', {
  type: 'checkbox',
  checked: false,
  onchange: function (e) {
    contactRepr.setParameters({ hydrogenBond: e.target.checked })
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(hydrogenBondCheckbox)
addElement(createElement('span', {
  innerText: 'hbond'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var weakHydrogenBondCheckbox = createElement('input', {
  type: 'checkbox',
  checked: false,
  onchange: function (e) {
    contactRepr.setParameters({ weakHydrogenBond: e.target.checked })
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(weakHydrogenBondCheckbox)
addElement(createElement('span', {
  innerText: 'weak hbond'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var waterHydrogenBondCheckbox = createElement('input', {
  type: 'checkbox',
  checked: false,
  onchange: function (e) {
    contactRepr.setParameters({ waterHydrogenBond: e.target.checked })
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(waterHydrogenBondCheckbox)
addElement(createElement('span', {
  innerText: 'water-water hbond'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var backboneHydrogenBondCheckbox = createElement('input', {
  type: 'checkbox',
  checked: false,
  onchange: function (e) {
    contactRepr.setParameters({ backboneHydrogenBond: e.target.checked })
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(backboneHydrogenBondCheckbox)
addElement(createElement('span', {
  innerText: 'backbone-backbone hbond'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var halogenBondCheckbox = createElement('input', {
  type: 'checkbox',
  checked: true,
  onchange: function (e) {
    contactRepr.setParameters({ halogenBond: e.target.checked })
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(halogenBondCheckbox)
addElement(createElement('span', {
  innerText: 'halogen bond'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var metalInteractionCheckbox = createElement('input', {
  type: 'checkbox',
  checked: true,
  onchange: function (e) {
    contactRepr.setParameters({ metalComplex: e.target.checked })
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(metalInteractionCheckbox)
addElement(createElement('span', {
  innerText: 'metal interaction'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var saltBridgeCheckbox = createElement('input', {
  type: 'checkbox',
  checked: true,
  onchange: function (e) {
    contactRepr.setParameters({ saltBridge: e.target.checked })
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(saltBridgeCheckbox)
addElement(createElement('span', {
  innerText: 'salt bridge'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var cationPiCheckbox = createElement('input', {
  type: 'checkbox',
  checked: true,
  onchange: function (e) {
    contactRepr.setParameters({ cationPi: e.target.checked })
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(cationPiCheckbox)
addElement(createElement('span', {
  innerText: 'cation-pi'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

var piStackingCheckbox = createElement('input', {
  type: 'checkbox',
  checked: true,
  onchange: function (e) {
    contactRepr.setParameters({ piStacking: e.target.checked })
  }
}, { top: getTopPosition(20), left: '12px' })
addElement(piStackingCheckbox)
addElement(createElement('span', {
  innerText: 'pi-stacking'
}, { top: getTopPosition(), left: '32px', color: 'grey' }))

loadStructure('data://machineLearning/2isk.pdb', 'data://machineLearning/2isk.csv')
