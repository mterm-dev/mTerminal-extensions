import React from 'react'
import { basename } from './FileEditor'
import { IconClose } from './icons'
import { fileEditorTabKey, type FileEditorTab } from '../shared/types'

interface Props {
  tabs: FileEditorTab[]
  activeKey: string | null
  dirtyMap: Record<string, boolean>
  onSelect: (key: string) => void
  onClose: (key: string) => void
}

export function FileEditorTabs({ tabs, activeKey, dirtyMap, onSelect, onClose }: Props): React.JSX.Element {
  return (
    <div className="fb-tabs" role="tablist">
      {tabs.map((tab) => {
        const key = fileEditorTabKey(tab)
        const isActive = key === activeKey
        const isDirty = Boolean(dirtyMap[key])
        const name = basename(tab.path, tab.backend)
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={
              'fb-tab' +
              (isActive ? ' fb-tab-active' : '') +
              (isDirty ? ' fb-tab-dirty' : '')
            }
            title={tab.path}
            onClick={() => onSelect(key)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onClose(key)
              }
            }}
          >
            <span className="fb-tab-name">{name}</span>
            <span
              className="fb-tab-close"
              role="button"
              aria-label="close tab"
              onClick={(e) => {
                e.stopPropagation()
                onClose(key)
              }}
            >
              <IconClose />
            </span>
          </button>
        )
      })}
    </div>
  )
}
