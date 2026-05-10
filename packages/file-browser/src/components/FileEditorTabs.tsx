import React from 'react'
import { basename } from './FileEditor'
import { IconClose } from './icons'
import type { FileEditorTab } from '../shared/types'

interface Props {
  tabs: FileEditorTab[]
  activePath: string | null
  dirtyMap: Record<string, boolean>
  onSelect: (path: string) => void
  onClose: (path: string) => void
}

export function FileEditorTabs({ tabs, activePath, dirtyMap, onSelect, onClose }: Props): React.JSX.Element {
  return (
    <div className="fb-tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.path === activePath
        const isDirty = Boolean(dirtyMap[tab.path])
        const name = basename(tab.path, tab.backend)
        return (
          <button
            key={tab.path}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={
              'fb-tab' +
              (isActive ? ' fb-tab-active' : '') +
              (isDirty ? ' fb-tab-dirty' : '')
            }
            title={tab.path}
            onClick={() => onSelect(tab.path)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onClose(tab.path)
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
                onClose(tab.path)
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
