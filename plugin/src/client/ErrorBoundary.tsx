import { Component, type ReactNode } from "react";
import type { Translate } from "./locales.js";

export class PluginErrorBoundary extends Component<{ t: Translate; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <div className="dsh-top100"><div className="error" role="alert">
      <strong>{this.props.t("clientErrorTitle")}</strong>
      <p>{this.props.t("clientErrorHint")}</p>
      <button type="button" onClick={() => this.setState({ failed: false })}>{this.props.t("retry")}</button>
    </div></div>;
  }
}
