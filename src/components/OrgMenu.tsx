import { Buildings, CaretRight, ClockCounterClockwise, SignOut, User } from '@phosphor-icons/react'
import type { Workspace } from '../data'

export function OrgMenu({
  workspace,
  onOpenSwitch,
  onClose,
}: {
  workspace: Workspace
  onOpenSwitch: () => void
  onClose: () => void
}) {
  return (
    <div className="org-menu" role="menu">
      <div className="org-menu-head">
        <div className="org-card">
          <div className="org-identity">
            <img className="org-logo" src={workspace.logo} alt={workspace.name} />
            {workspace.role ? <span className="org-role">{workspace.role}</span> : null}
          </div>
          <button className="org-details" type="button" onClick={onOpenSwitch}>
            <div className="org-details-text">
              <span className="org-name">{workspace.name}</span>
              <span className="org-email">{workspace.email}</span>
            </div>
            <CaretRight size={20} color="var(--content-tertiary)" />
          </button>
        </div>
      </div>

      <div className="org-section org-section-settings">
        <div className="org-menu-list">
          <button className="menu-item org-menu-item" type="button" role="option" onClick={onClose}>
            <span className="menu-icon"><Buildings size={20} color="var(--content-tertiary)" /></span>
            <span className="menu-label">Organization settings</span>
          </button>
          <button className="menu-item org-menu-item" type="button" role="option" onClick={onClose}>
            <span className="menu-icon"><User size={20} color="var(--content-tertiary)" /></span>
            <span className="menu-label">Profile settings</span>
          </button>
        </div>
      </div>

      <div className="org-section org-section-account">
        <div className="org-menu-list">
          <button className="menu-item org-menu-item" type="button" role="option" onClick={onClose}>
            <span className="menu-icon"><ClockCounterClockwise size={20} color="var(--content-tertiary)" /></span>
            <span className="menu-label">Change log</span>
          </button>
          <button className="menu-item org-menu-item" type="button" role="option" onClick={onClose}>
            <span className="menu-icon"><SignOut size={20} color="var(--content-tertiary)" /></span>
            <span className="menu-label">Log out</span>
          </button>
        </div>
      </div>

      <div className="org-version">Mithril v3.2</div>
    </div>
  )
}
