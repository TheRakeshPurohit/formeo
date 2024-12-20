import ComponentData from './component-data.js'
import External from './component.js'

export class Externals extends ComponentData {
  constructor(externalData) {
    super('externals', externalData)
  }
  Component(data) {
    return new External('external', data)
  }
}

const externals = new Externals()

export default externals
