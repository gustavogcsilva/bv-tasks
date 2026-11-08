interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function Logo({ size = 'md', showText = true }: LogoProps) {
  const dimensions = {
    sm: 'h-10 w-10',
    md: 'h-12 w-12',
    lg: 'h-20 w-20',
  }[size];

  return (
    <div className="inline-flex items-center gap-3.5 select-none">
      <div
        className={`${dimensions} relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#991B1B]/40 bg-gradient-to-br from-[#09090B] via-[#450A0A] to-[#881337] shadow-lg shadow-[#7F1D1D]/25`}
      >
        <svg
          viewBox="0 0 140 140"
          className="h-full w-full p-1"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Logo B V Tasks — Garrafa de Vinho, Taça de Vinho, Livro e Iniciais B V"
        >
          {/* Moldura circular executiva sutil */}
          <circle
            cx="70"
            cy="64"
            r="56"
            stroke="#FDE68A"
            strokeOpacity="0.22"
            strokeWidth="1.5"
          />

          {/* Garrafa de Vinho (Lado Esquerdo Central) */}
          {/* Gargalo e cápsula */}
          <rect x="48" y="15" width="8" height="14" rx="2" fill="#09090B" stroke="#FDE68A" strokeWidth="2" />
          <line x1="47" y1="19" x2="57" y2="19" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" />
          {/* Corpo da Garrafa */}
          <path
            d="M48 29C44 33 42 38 42 44V74C42 76.2 43.8 78 46 78H58C60.2 78 62 76.2 62 74V44C62 38 60 33 56 29H48Z"
            fill="#18181B"
            stroke="#FDE68A"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {/* Rótulo Bordeaux na Garrafa */}
          <rect x="45.5" y="46" width="13" height="18" rx="1.5" fill="#991B1B" stroke="#FDE68A" strokeWidth="1.2" />

          {/* Taça de Vinho (Lado Direito Central) */}
          <path
            d="M72 34H94L91.5 49C90.2 56 86.5 60 83 60C79.5 60 75.8 56 74.5 49L72 34Z"
            stroke="#FDE68A"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Vinho Vermelho Rubi na Taça */}
          <path
            d="M74.5 43H91.5L90.5 48C89.5 53.5 86.5 57 83 57C79.5 57 76.5 53.5 75.5 48L74.5 43Z"
            fill="#DC2626"
          />
          {/* Haste e base da Taça */}
          <path d="M83 60V76" stroke="#FDE68A" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M75 76H91" stroke="#FDE68A" strokeWidth="2.6" strokeLinecap="round" />

          {/* Livro Aberto na Base */}
          <path
            d="M24 85C39 81 55 83 70 90C85 83 101 81 116 85V110C101 106 85 108 70 115C55 108 39 106 24 110V85Z"
            fill="#FAFAFA"
            stroke="#FDE68A"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          {/* Páginas internas e lombada vermelho vinho */}
          <path d="M70 90V115" stroke="#991B1B" strokeWidth="3" strokeLinecap="round" />
          <path d="M33 93C44 91 56 92 65 96" stroke="#991B1B" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.6" />
          <path d="M107 93C96 91 84 92 75 96" stroke="#991B1B" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.6" />

          {/* Iniciais Profissionais B e V */}
          <text
            x="16"
            y="65"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
            fontWeight="800"
            fontSize="23"
            letterSpacing="-0.5"
          >
            B
          </text>
          <text
            x="101"
            y="65"
            fill="#FFFFFF"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
            fontWeight="800"
            fontSize="23"
            letterSpacing="-0.5"
          >
            V
          </text>
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <span className="text-[10px] font-extrabold tracking-[2px] text-[#991B1B] uppercase dark:text-[#F87171]">
            EXECUTIVE PLANNER
          </span>
          <span className="text-[22px] leading-tight font-extrabold tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]">
            B V Tasks
          </span>
        </div>
      )}
    </div>
  );
}
