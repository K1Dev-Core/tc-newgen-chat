export function PigeonLogo({ className = '' }: { className?: string }) {
  return <video
    className={`pigeon-logo ${className}`}
    autoPlay
    loop
    muted
    playsInline
    aria-label="ทีซี นิวเจน pigeon mascot"
  >
    <source src="/pigeon-mascot.webm" type="video/webm" />
  </video>;
}
