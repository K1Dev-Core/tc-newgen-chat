export function LoadingOverlay({ label }: { label: string }) {
  return <div className="loading-overlay" role="status" aria-live="polite" aria-label={label}>
    <div className="loading-overlay-content">
      <div className="loading-mascot-frame">
        <span className="loading-orbit" aria-hidden="true" />
        <video className="loading-mascot" autoPlay loop muted playsInline aria-hidden="true" poster="/pigeon-loader-poster.png">
          <source src="/pigeon-loader.webm" type="video/webm" />
        </video>
      </div>
      <span className="loading-label">{label}</span>
    </div>
  </div>;
}
