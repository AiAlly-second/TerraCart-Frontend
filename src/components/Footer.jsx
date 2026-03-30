import aiAllyLogo from "../assets/images/AiAlly_logo.png";

const FOOTER_VARIANTS = {
  default: "bg-white border-t border-gray-200 text-gray-700",
  subtle: "bg-gray-50 border-t border-gray-200 text-gray-600",
};

export default function Footer({
  brandLabel = "Powered by",
  brandName = "Ai Ally",
  logoSrc = aiAllyLogo,
  variant = "default",
  className = "",
}) {
  const variantClasses = FOOTER_VARIANTS[variant] ?? FOOTER_VARIANTS.default;

  return (
    <footer
      className={`footer-safe-area mt-auto w-full px-2 py-2 text-center sm:px-3 ${variantClasses} ${className}`.trim()}
    >
      <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
        <span className="text-xs sm:text-sm font-medium text-current">
          {brandLabel}
          <span className="sr-only"> {brandName}</span>
        </span>
        <img
          src={logoSrc}
          alt=""
          aria-hidden="true"
          className="h-4 sm:h-5 w-auto"
          loading="lazy"
          decoding="async"
        />
      </div>
    </footer>
  );
}
