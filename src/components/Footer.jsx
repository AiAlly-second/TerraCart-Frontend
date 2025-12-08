import aiAllyLogo from "../assets/images/AiAlly_logo.png";


export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 text-center py-2 px-2 sm:px-3 z-40">
      <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
        <span className="text-xs sm:text-sm font-medium text-gray-700">
          Powered by
        </span>
        <img
          src={aiAllyLogo}
          alt="Ai Ally"
          className="h-4 sm:h-5 w-auto"
        />
      </div>
    </footer>
  );
}
