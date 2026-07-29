import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";

type LazyFeatureBoundaryProps = {
  children: ReactNode;
  label: string;
};

type LazyFeatureErrorBoundaryState = {
  error: Error | null;
};

class LazyFeatureErrorBoundary extends Component<LazyFeatureBoundaryProps, LazyFeatureErrorBoundaryState> {
  state: LazyFeatureErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Unable to load ${this.props.label}`, error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="feature-load-error" role="alert">
          <strong>{this.props.label}加载失败</strong>
          <span>本地资源可能已更新，请重新加载应用后再试。</span>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            重新加载应用
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

export function LazyFeatureBoundary({ children, label }: LazyFeatureBoundaryProps) {
  return (
    <LazyFeatureErrorBoundary label={label}>
      <Suspense fallback={<div className="feature-loading" role="status">正在加载{label}...</div>}>
        {children}
      </Suspense>
    </LazyFeatureErrorBoundary>
  );
}
