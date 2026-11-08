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
    <div className="inline-flex items-center gap-3 select-none">
      <div
        className={`${dimensions} relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#991B1B]/40 bg-gradient-to-br from-[#09090B] via-[#450A0A] to-[#881337] shadow-lg shadow-[#7F1D1D]/25`}
      >
        <svg
          viewBox="0 0 140 140"
          className="h-full w-full p-1"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Logo BVS Special — Garrafa de Vinho, Taça de Vinho, Livro Aberto"
        >
          {/* Moldura circular executiva sutil */}
          <circle
            cx="70"
            cy="66"
            r="56"
            stroke="#FDE68A"
            strokeOpacity="0.25"
            strokeWidth="1.5"
          />

          {/* Garrafa de Vinho (Central Esquerda) */}
          {/* Gargalo e cápsula */}
          <rect x="49" y="16" width="9" height="15" rx="2" fill="#09090B" stroke="#FDE68A" strokeWidth="2" />
          <line x1="48" y1="20" x2="59" y2="20" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" />
          {/* Corpo da Garrafa */}
          <path
            d="M49 31C44 35 42 40 42 46V76C42 78.2 43.8 80 46 80H59C61.2 80 63 78.2 63 76V46C63 40 61 35 56 31H49Z"
            fill="#18181B"
            stroke="#FDE68A"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {/* Rótulo Bordeaux na Garrafa */}
          <rect x="46" y="48" width="13.5" height="18" rx="1.5" fill="#991B1B" stroke="#FDE68A" strokeWidth="1.2" />

          {/* Taça de Vinho (Central Direita) */}
          <path
            d="M74 36H96L93.5 51C92.2 58 88.5 62 85 62C81.5 62 77.8 58 76.5 51L74 36Z"
            stroke="#FDE68A"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Vinho Vermelho Rubi na Taça */}
          <path
            d="M76.5 45H93.5L92.5 50C91.5 55.5 88.5 59 85 59C81.5 59 78.5 55.5 77.5 50L76.5 45Z"
            fill="#DC2626"
          />
          {/* Haste e base da Taça */}
          <path d="M85 62V78" stroke="#FDE68A" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M77 78H93" stroke="#FDE68A" strokeWidth="2.6" strokeLinecap="round" />

          {/* Livro Aberto na Base */}
          <path
            d="M24 87C39 83 55 85 70 92C85 85 101 83 116 87V111C101 107 85 109 70 116C55 109 39 107 24 111V87Z"
            fill="#FAFAFA"
            stroke="#FDE68A"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          {/* Páginas internas e lombada vermelho vinho */}
          <path d="M70 92V116" stroke="#991B1B" strokeWidth="3" strokeLinecap="round" />
          <path d="M33 95C44 93 56 94 65 98" stroke="#991B1B" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.6" />
          <path d="M107 95C96 93 84 94 75 98" stroke="#991B1B" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.6" />

          {/* Identificação Oficial: Somente BVS Special (sem BV nas laterais) */}
          <rect x="22" y="121" width="96" height="15" rx="4" fill="#09090B" stroke="#FDE68A" strokeWidth="1" strokeOpacity="0.7" />
          <text
            x="70"
            y="132"
            textAnchor="middle"
            fill="#FDE68A"
            fontFamily="'Cinzel', Georgia, serif"
            fontWeight="800"
            fontSize="10"
            letterSpacing="1.2"
          >
            BVS SPECIAL
          </text>
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <span className="font-heading text-[10px] font-extrabold tracking-[2px] text-[#991B1B] uppercase dark:text-[#F87171]">
            EXECUTIVE PLANNER
          </span>
          <span className="font-display text-[20px] sm:text-[23px] leading-tight font-black tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]">
            BVS Special
          </span>
        </div>
      )}
    </div>
  );
}
