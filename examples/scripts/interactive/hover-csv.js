// create tooltip element and add to document body
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

// load a structure file
Promise.all([
  stage.loadFile('data://mutcompute/6ij6.pdb', { defaultRepresentation: true }),
  NGL.autoLoad('data://mutcompute/6ij6.csv', {
    ext: 'csv',
    delimiter: ' ',
    comment: '#',
    columnNames: true
  })

]).then(function (ol) {
  var struc = ol[0].structure.residueStore
  var csv = ol[1].data
  // var names = ol[1].columnNames
  // var resno = struc.residueStore.resno
  console.log('struc', struc)

  var csvResNumCol = 4
  var csvWtProbCol = 7
  var csvPrAaCol = 6
  var csvPrProbCol = 8
  const firstResNum = parseInt(csv[0][csvResNumCol])
  // adds csv column to structure residueStore
  function addStrucValue () {
    var array = []
    for (var i = 0; i < csv.length; i++) {
      var predAaProb = csv[i][csvPrProbCol]
      array.push(predAaProb)
    }
    struc.predAA = array
    return struc.predAA
  }
  addStrucValue()
  console.log('struc2', struc)

  // remove default hoverPick mouse action
  stage.mouseControls.remove('hoverPick')
  // listen to `hovered` signal to move tooltip around and change its text
  stage.signals.hovered.add(function (pickingProxy) {
    // console.log('pick', pickingProxy.atom)
    if (pickingProxy && (pickingProxy.atom || pickingProxy.bond)) {
      var atom = pickingProxy.atom || pickingProxy.closestBondAtom
      // var mp = pickingProxy.mouse.position
      var index = atom.resno - firstResNum
      if (index < csv.length) {
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
  })
})
