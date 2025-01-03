import i18n from '@draggable/i18n'
import dom from '../../common/dom.js'
import Panels from '../panels.js'
import { clone, debounce, throttle, unique } from '../../common/utils/index.mjs'
import EditPanel from './edit-panel.js'
import Component from '../component.js'
import { FIELD_CLASSNAME, CONDITION_TEMPLATE, ANIMATION_SPEED_BASE } from '../../constants.js'
import Components from '../index.js'
import { toTitleCase } from '../../common/utils/string.mjs'
import controls from '../controls/index.js'
import { indexOfNode } from '../../common/helpers.mjs'

const DEFAULT_DATA = () => ({
  conditions: [CONDITION_TEMPLATE()],
})

/**
 * Element/Field class.
 */
export default class Field extends Component {
  /**
   * Set defaults and load fieldData
   * @param  {Object} fieldData existing field ID
   * @return {Object} field object
   */
  constructor(fieldData = Object.create(null)) {
    super('field', { ...DEFAULT_DATA(), ...fieldData })

    this.debouncedUpdateEditPanels = debounce(this.updateEditPanels)
    this.label = dom.create(this.labelConfig)
    this.preview = dom.create({})
    this.editPanels = []

    const actionButtons = this.getActionButtons()
    const hasEditButton = this.actionButtons.some(child => child.meta?.id === 'edit')

    let field = {
      tag: 'li',
      attrs: {
        className: FIELD_CLASSNAME,
      },
      id: this.id,
      children: [
        this.label,
        this.getComponentTag(),
        actionButtons,
        hasEditButton && this.fieldEdit, // fieldEdit window,
        this.preview,
      ].filter(Boolean),
      panelNav: this.panelNav,
      dataset: {
        hoverTag: i18n.get('field'),
      },
    }

    field = dom.create(field)
    this.observe(field)

    this.dom = field
    this.isEditing = false
    this.onRender(field)
  }

  get labelConfig() {
    const hideLabel = !!this.get('config.hideLabel')

    if (hideLabel) {
      return null
    }

    const labelVal = this.get('config.editorLabel') || this.get('config.label')
    const required = this.get('attrs.required')
    const disableHTML = this.config.label.disableHTML

    const labelConfig = () => {
      const config = {
        tag: 'label',
        attrs: {},
      }
      if (disableHTML) {
        config.tag = 'input'
        config.attrs.value = labelVal
        return config
      }
      config.attrs.contenteditable = true
      config.children = labelVal
      return config
    }

    const label = {
      ...labelConfig(),
      action: {
        input: ({ target: { innerHTML, innerText, value } }) => {
          super.set('config.label', disableHTML ? value : innerHTML)
          const reverseConditionField = Components.getConditionMap(`fields.${this.id}`)
          if (reverseConditionField) {
            return reverseConditionField.updateConditionSourceLabel(
              `${this.name}s.${this.id}`,
              disableHTML ? value : innerText,
            )
          }
        },
      },
    }

    const labelWrap = {
      className: 'prev-label',
      children: [label, required && dom.requiredMark()],
    }

    return labelWrap
  }

  /**
   * Updates a source field's label without recreating conditions dom
   */
  updateConditionSourceLabel(value, label) {
    const newConditionsPanel = this.editPanels.find(({ name }) => name === 'conditions')
    if (!newConditionsPanel) {
      return null
    }

    for (const { itemFieldGroups } of newConditionsPanel.editPanelItems) {
      for (const fields of itemFieldGroups) {
        const autocomplete = fields.find(field => field.value === value)
        if (autocomplete) {
          autocomplete.displayField.value = label
        }
      }
    }
  }

  setData = (path, value) => {
    return super.set(path, value)
  }

  /**
   * wrapper for Data.set
   */
  set(path, value) {
    const data = this.setData(path, value)
    this.updatePreview()

    return data
  }

  /**
   * Update the label dom when label data changes
   */
  updateLabel() {
    if (!this.label) {
      return null
    }
    const newLabel = dom.create(this.labelConfig)
    this.label.parentElement.replaceChild(newLabel, this.label)
    this.label = newLabel
  }

  /**
   * Updates the conditions panel when linked field data changes
   */
  updateConditionsPanel = throttle(() => {
    const newConditionsPanel = this.editPanels.find(({ name }) => name === 'conditions')
    if (!newConditionsPanel) {
      return null
    }
    const newProps = newConditionsPanel.createProps()
    const currentConditionsProps = this.dom.querySelector('.field-edit-conditions')
    currentConditionsProps.parentElement.replaceChild(newProps, currentConditionsProps)
  }, ANIMATION_SPEED_BASE)

  /**
   * Updates a field's preview
   * @return {Object} fresh preview
   */
  updatePreview = () => {
    if (!this.preview.parentElement) {
      return null
    }
    this.updateLabel()
    const newPreview = dom.create(this.fieldPreview(), true)
    this.preview.parentElement.replaceChild(newPreview, this.preview)
    this.preview = newPreview
  }

  updateEditPanels = () => {
    this.editPanels = []
    const editable = ['object', 'array']
    const panelOrder = unique([...this.config.panels.order, ...Object.keys(this.data)])
    const noPanels = ['config', 'meta', 'action', 'events', ...this.config.panels.disabled]
    const allowedPanels = panelOrder.filter(panelName => !noPanels.includes(panelName))

    for (const panelName of allowedPanels) {
      const panelData = this.get(panelName)
      const propType = dom.childType(panelData)
      if (editable.includes(propType)) {
        const editPanel = new EditPanel(panelData, panelName, this)
        this.editPanels.push(editPanel)
      }
    }

    const panelsData = {
      panels: this.editPanels.map(({ panelConfig }) => panelConfig),
      id: this.id,
      displayType: 'auto',
    }

    this.panels = new Panels(panelsData)
    if (this.dom) {
      this.dom.querySelector('.panel-nav').replaceWith(this.panels.panelNav)
      this.dom.querySelector('.panels').replaceWith(this.panels.panelsWrap)
    }
  }

  /**
   * Generate the markup for field edit mode
   * @return {Object} fieldEdit element config
   */
  get fieldEdit() {
    const fieldEdit = {
      className: ['field-edit', 'slide-toggle', 'formeo-panels-wrap'],
    }

    this.updateEditPanels()

    const editPanelLength = this.editPanels.length

    if (editPanelLength) {
      fieldEdit.className.push(`panel-count-${editPanelLength}`)
      fieldEdit.content = [this.panels.panelNav, this.panels.panelsWrap]
      this.panelNav = this.panels.nav
      this.resizePanelWrap = this.panels.nav.refresh
    }

    fieldEdit.action = {
      onRender: () => {
        if (editPanelLength === 0) {
          // If this element has no edit panels, remove the edit toggle
          const field = this.dom
          const editToggle = field.querySelector('.item-edit-toggle')
          const fieldActions = field.querySelector('.field-actions')
          const actionButtons = fieldActions.getElementsByTagName('button')
          fieldActions.style.maxWidth = `${actionButtons.length * actionButtons[0].clientWidth}px`
          dom.remove(editToggle)
        } else {
          this.resizePanelWrap()
        }
      },
    }

    return dom.create(fieldEdit)
  }

  toggleCheckedOptions = (optionIndex, type) => {
    const updatedOptionData = this.get('options').map((option, index) => {
      const isCurrentIndex = index === optionIndex
      if (type === 'radio') {
        option.selected = isCurrentIndex
      } else {
        option.checked = isCurrentIndex ? !option.checked : option.checked
      }

      return option
    })
    this.set('options', updatedOptionData)
  }

  get defaultPreviewActions() {
    return {
      change: evt => {
        const { target } = evt
        const { type } = target
        if (['checkbox', 'radio'].includes(type)) {
          const optionIndex = +target.id.split('-').pop()
          this.toggleCheckedOptions(optionIndex, type)
          this.debouncedUpdateEditPanels()
        }
      },
      click: evt => {
        if (evt.target.contentEditable === 'true') {
          evt.preventDefault()
        }
      },
      input: evt => {
        if (['input', 'meter', 'progress', 'button'].includes(evt.target.tagName.toLowerCase())) {
          super.set('attrs.value', evt.target.value)
          return this.debouncedUpdateEditPanels()
        }

        if (evt.target.contentEditable) {
          const target = evt.target
          const parentClassList = target.parentElement.classList
          const isOption = parentClassList.contains('f-checkbox') || parentClassList.contains('f-radio')
          if (isOption) {
            const option = target.parentElement
            const optionWrap = option.parentElement
            const optionIndex = indexOfNode(option, optionWrap)
            this.setData(`options[${optionIndex}].label`, target.innerHTML)
            return this.debouncedUpdateEditPanels()
          }

          this.setData('content', target.innerHTML || target.value)
        }
      },
    }
  }

  /**
   * Generate field preview config
   * @return {Object} fieldPreview
   */
  fieldPreview() {
    const prevData = clone(this.data)
    const { action = {} } = controls.get(prevData.config.controlId)
    prevData.id = `prev-${this.id}`
    prevData.action = Object.entries(action).reduce((acc, [key, value]) => {
      acc[key] = value.bind(this)
      return acc
    }, {})

    if (this.data?.config.editableContent) {
      prevData.attrs = { ...prevData.attrs, contenteditable: true }
    }

    const fieldPreview = {
      attrs: {
        className: 'field-preview',
        style: this.isEditing && 'display: none;',
      },
      content: dom.create(prevData, true),
      action: this.defaultPreviewActions,
    }

    return fieldPreview
  }

  /**
   * Checks if attribute is allowed to be edited
   * @param  {String}  propName
   * @return {Boolean}
   */
  isDisabledProp = (propName, kind = 'attrs') => {
    const propKind = this.config.panels[kind]
    if (!propKind) {
      return false
    }
    const disabledAttrs = propKind.disabled.concat(this.get(`config.disabled${toTitleCase(kind)}`))
    return disabledAttrs.includes(propName)
  }

  /**
   * Checks if property can be removed
   * @param  {String}  propName
   * @return {Boolean}
   */
  isLockedProp = (propName, kind = 'attrs') => {
    const propKind = this.config.panels[kind]
    if (!propKind) {
      return false
    }
    const lockedAttrs = propKind.locked.concat(this.get(`config.locked${toTitleCase(kind)}`))
    return lockedAttrs.includes(propName)
  }
}
