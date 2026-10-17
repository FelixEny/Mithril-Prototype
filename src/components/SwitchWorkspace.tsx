import type { Workspace } from '../data'

export function SwitchWorkspace({
  workspaces,
  activeId,
  onSelect,
  onClose,
}: {
  workspaces: Workspace[]
  activeId: string
  onSelect: (ws: Workspace) => void
  onClose: () => void
}) {
  return (
    <div className="switch-workspace" role="menu">
      <div className="sw-head">Switch workspace</div>
      <div className="sw-list">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeId
          return (
            <button
              key={ws.id}
              type="button"
              role="option"
              className={`sw-option${isActive ? ' active' : ''}`}
              onClick={() => {
                onSelect(ws)
                onClose()
              }}
            >
              <span className="sw-thumb">
                <img src={ws.logo} alt={ws.name} />
              </span>
              <span className="sw-details">
                <span className="sw-name">{ws.name}</span>
                <span className="sw-email">{ws.email}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
