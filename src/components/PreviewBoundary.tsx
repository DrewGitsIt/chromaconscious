import { Component } from 'react'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Keeps a preview crash from unmounting the whole workbench. */
export class PreviewBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div>
          <div className="frame-indicator">preview crashed</div>
          <div style={{ padding: 16, fontSize: 12, color: '#ff8a8a' }}>
            {this.state.error.message}
            <div style={{ marginTop: 8 }}>
              <button onClick={() => this.setState({ error: null })}>retry</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
