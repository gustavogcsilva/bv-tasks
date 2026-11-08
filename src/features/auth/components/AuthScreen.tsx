import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Logo } from '../../../components/ui/Logo';
import {
  isValidEmail,
  loadGoogleGsiScript,
  validateName,
  validatePassword,
  verifyGoogleJwt,
} from '../../../services/authSecurity';
import { apiRequestResetLink } from '../../../services/apiSync';
import { useTaskStore } from '../../../stores/useTaskStore';

type AuthMode = 'register' | 'login' | 'forgot' | 'google-direct';
type RecoveryMethod = 'keyword' | 'email';

export function AuthScreen() {
  const registeredAccounts = useTaskStore((state) => state.registeredAccounts);
  const theme = useTaskStore((state) => state.theme);
  const toggleTheme = useTaskStore((state) => state.toggleTheme);
  const dbEngine = useTaskStore((state) => state.dbEngine);
  const checkDatabaseHealth = useTaskStore((state) => state.checkDatabaseHealth);
  const registerAccount = useTaskStore((state) => state.registerAccount);
  const loginAccount = useTaskStore((state) => state.loginAccount);
  const loginWithGoogle = useTaskStore((state) => state.loginWithGoogle);
  const resetPasswordWithKeyword = useTaskStore((state) => state.resetPasswordWithKeyword);
  const requestPasswordResetLink = useTaskStore((state) => state.requestPasswordResetLink);
  const resetPasswordViaEmailLink = useTaskStore((state) => state.resetPasswordViaEmailLink);

  const [mode, setMode] = useState<AuthMode>(
    registeredAccounts.length > 0 ? 'login' : 'register',
  );
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>('keyword');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryKeyword, setRecoveryKeyword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [generatedResetLink, setGeneratedResetLink] = useState<string | null>(null);
  const [urlResetToken, setUrlResetToken] = useState<string | undefined>(undefined);
  const [isEmailResetStep2, setIsEmailResetStep2] = useState(false);

  // Estados para autenticação estilo conta de e-mail do Google (sem JWT)
  const [googleEmail, setGoogleEmail] = useState('');
  const [googlePassword, setGooglePassword] = useState('');
  const [googleName, setGoogleName] = useState('');

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const googleBtnContainerRef = useRef<HTMLDivElement | null>(null);

  // Inicializa o Google Identity Services (GSI) caso haja Client ID configurado
  useEffect(() => {
    let isMounted = true;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

    void loadGoogleGsiScript().then((loaded) => {
      if (!isMounted || !loaded) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as any).google;
      if (google?.accounts?.id && clientId) {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential?: string }) => {
            if (!response.credential) {
              setError('Credencial não recebida do Google.');
              return;
            }
            const verification = verifyGoogleJwt(response.credential);
            if (verification.ok && verification.profile) {
              loginWithGoogle({
                name: verification.profile.name,
                email: verification.profile.email,
                avatarUrl: verification.profile.picture,
                googleId: verification.profile.id,
              });
            } else {
              setError(verification.error ?? 'Falha na validação do token do Google.');
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (googleBtnContainerRef.current) {
          google.accounts.id.renderButton(googleBtnContainerRef.current, {
            theme: theme === 'dark' ? 'filled_black' : 'outline',
            size: 'large',
            width: '100%',
            text: 'continue_with',
            shape: 'rectangular',
          });
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loginWithGoogle, theme]);

  // Verifica conexão com o servidor e banco de dados SQL ao abrir a tela de autenticação
  useEffect(() => {
    void checkDatabaseHealth();
  }, [checkDatabaseHealth]);

  // Se o usuário abrir o link recebido no e-mail (?reset_token=...&email=...), abre direto a criação de nova senha
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    const emailParam = params.get('email');
    if (token && emailParam) {
      setMode('forgot');
      setRecoveryMethod('email');
      setEmail(emailParam);
      setUrlResetToken(token);
      setIsEmailResetStep2(true);
      setSuccessMessage('Link validado com sucesso! Digite sua nova senha abaixo.');
    }
  }, []);

  function clearFeedback() {
    setError('');
    setSuccessMessage('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (mode === 'register') {
      const nameCheck = validateName(name);
      if (!nameCheck.valid) {
        setError(nameCheck.error ?? 'Nome inválido.');
        return;
      }
      if (!isValidEmail(email)) {
        setError('Informe um endereço de e-mail corporativo ou pessoal válido.');
        return;
      }
      const passCheck = validatePassword(password);
      if (!passCheck.valid) {
        setError(passCheck.error ?? 'Senha muito curta.');
        return;
      }

      const result = await registerAccount(name, email, password, recoveryKeyword);
      if (!result.ok) {
        setError(result.error ?? 'Erro ao criar conta.');
      }
      return;
    }

    if (mode === 'login') {
      if (!isValidEmail(email)) {
        setError('Informe um e-mail válido.');
        return;
      }
      if (!password) {
        setError('Informe sua senha.');
        return;
      }
      const result = await loginAccount(email, password);
      if (!result.ok) {
        setError(result.error ?? 'Credenciais inválidas.');
      }
      return;
    }

    if (mode === 'google-direct') {
      await handleDirectGoogleAuth();
      return;
    }

    // Modo Recuperação de Senha (forgot)
    if (recoveryMethod === 'keyword') {
      const result = await resetPasswordWithKeyword(email, recoveryKeyword, newPassword);
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível redefinir a senha.');
      }
      return;
    }

    // Recuperação via Link por E-mail (token HMAC assinado no servidor com fallback local)
    if (!isEmailResetStep2) {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'https://bv-tasks.onrender.com';
      const serverLink = await apiRequestResetLink(email, origin);
      if (serverLink.ok && serverLink.resetLink) {
        const parsed = new URL(serverLink.resetLink);
        setUrlResetToken(parsed.searchParams.get('reset_token') || undefined);
        setGeneratedResetLink(serverLink.resetLink);
        setSuccessMessage(
          `Link de redefinição seguro gerado para ${email.trim()}. Clique abaixo para definir sua nova senha.`,
        );
        return;
      }
      if (!serverLink.offline) {
        setError(serverLink.error ?? 'E-mail não encontrado no banco SQL.');
        return;
      }
      const linkResult = requestPasswordResetLink(email);
      if (!linkResult.ok) {
        setError(linkResult.error ?? 'E-mail não encontrado no sistema.');
        return;
      }
      setGeneratedResetLink(linkResult.resetLink ?? null);
      setSuccessMessage(
        `Link de redefinição enviado para ${email.trim()}. Clique no link abaixo para criar sua nova senha.`,
      );
    } else {
      const resetRes = await resetPasswordViaEmailLink(email, newPassword, urlResetToken);
      if (!resetRes.ok) {
        setError(resetRes.error ?? 'Erro ao salvar nova senha.');
      }
    }
  }

  function handleGoogleButtonTrigger() {
    clearFeedback();
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

    // Se houver Google Client ID configurado no ambiente, tenta abrir o prompt nativo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;
    if (google?.accounts?.id && clientId) {
      try {
        google.accounts.id.prompt((notification: { isNotDisplayed: () => boolean }) => {
          if (notification.isNotDisplayed()) {
            setMode('google-direct');
          }
        });
        return;
      } catch {
        // Fallback para formulário direto de conta Google
      }
    }

    // Abre o formulário limpo de autenticação do Google (como entrar no e-mail, sem JWT)
    setMode('google-direct');
    if (email && email.includes('@')) {
      setGoogleEmail(email);
    }
  }

  async function handleDirectGoogleAuth() {
    clearFeedback();

    const normalizedEmail = googleEmail.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError('Informe um e-mail Google válido (ex: seu.nome@gmail.com ou conta corporativa).');
      return;
    }

    if (!normalizedEmail.endsWith('@gmail.com') && !normalizedEmail.includes('@')) {
      setError('O e-mail deve ser uma conta Google válida (@gmail.com).');
      return;
    }

    const passCheck = validatePassword(googlePassword);
    if (!passCheck.valid) {
      setError('Informe a senha da sua conta Google (mínimo de 6 caracteres).');
      return;
    }

    const resolvedName =
      googleName.trim() ||
      normalizedEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const result = await loginWithGoogle({
      name: resolvedName,
      email: normalizedEmail,
      password: googlePassword.trim(),
    });

    if (!result.ok) {
      setError('Senha incorreta para esta conta Google cadastrada.');
    }
  }

  return (
    <div className="safe-area-container flex min-h-dvh w-full items-center justify-center bg-gradient-to-br from-[#F8F7F4] via-[#F3EFEA] to-[#EAE3DC] dark:from-[#09090B] dark:via-[#120C0E] dark:to-[#1C1014]">
      <div className="w-full max-w-md rounded-3xl border border-[#E2DDD5] bg-white p-6 shadow-2xl shadow-black/10 sm:p-8 dark:border-[#27272A] dark:bg-[#141418]">
        {/* Barra superior com Alternador Claro / Escuro */}
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Alternar tema claro ou escuro"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#E2DDD5] bg-[#F8F7F4] px-3 py-1.5 text-[12px] font-bold text-[#18181B] transition-colors hover:bg-[#ECE9E2] dark:border-[#2E2E34] dark:bg-[#1E1E24] dark:text-[#F4F4F5]"
          >
            <span>{theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro'}</span>
          </button>
        </div>

        {/* Logo B.V.S Special (Garrafa + Taça de Vinho + Livro + B V) com Tipografia de Sistema HIG */}
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size="lg" showText={false} />
          <h1 className="mt-4 text-[26px] font-extrabold tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]">
            B.V.S Special
          </h1>
          <p className="mt-1 text-[13px] font-medium text-[#52525B] dark:text-[#A1A1AA]">
            Planejamento executivo para{' '}
            <span className="font-bold text-[#991B1B] dark:text-[#F87171]">Trabalho</span>,{' '}
            <span className="font-bold text-[#2563EB] dark:text-[#60A5FA]">Pessoal</span> e{' '}
            <span className="font-bold text-[#DB2777] dark:text-[#F472B6]">Estudo</span>
          </p>
        </div>

        {/* Container para o botão oficial do Google Identity Services (GSI) */}
        <div ref={googleBtnContainerRef} className="empty:hidden mb-2.5 w-full" />

        {/* Botão de Autenticação com Google */}
        <button
          type="button"
          onClick={handleGoogleButtonTrigger}
          className="mb-3 flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[#D6D3CD] bg-white px-4 text-[14px] font-bold text-[#0F0F12] shadow-xs transition-all hover:bg-[#F8F7F4] active:scale-[0.99] dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#F4F4F5] dark:hover:bg-[#24242C]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-2 3l3.2 2.5c1.9-1.7 3-4.3 3-7.4 0-.7-.1-1.4-.2-2H12z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.9v2.6C4.6 19.8 8 22 12 22z"
            />
            <path
              fill="#4A90E2"
              d="M6.2 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8V7.6H2.9C2.3 8.9 2 10.4 2 12s.3 3.1.9 4.4l3.3-2.6z"
            />
            <path
              fill="#FBBC05"
              d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8 2 4.6 4.2 2.9 7.6l3.3 2.6c.8-2.5 3.1-4.3 5.8-4.3z"
            />
          </svg>
          <span>Continuar com o Google</span>
        </button>

        <div className="relative mb-4 flex items-center justify-center">
          <div className="w-full border-t border-[#E5E4E0] dark:border-[#27272A]" />
          <span className="bg-white px-3 text-[11px] font-bold tracking-wider text-[#71717A] uppercase dark:bg-[#141418]">
            ou com sua conta
          </span>
          <div className="w-full border-t border-[#E5E4E0] dark:border-[#27272A]" />
        </div>

        {/* Abas Criar Conta / Entrar / Recuperar Senha */}
        <div className="mb-5 grid grid-cols-3 rounded-xl bg-[#F1EFEA] p-1 dark:bg-[#1E1E24]">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              clearFeedback();
            }}
            className={`cursor-pointer rounded-lg py-2 text-[12px] font-bold transition-all ${
              mode === 'register'
                ? 'bg-[#0F0F12] text-white shadow-xs dark:bg-[#991B1B]'
                : 'text-[#52525B] hover:text-[#0F0F12] dark:text-[#A1A1AA] dark:hover:text-white'
            }`}
          >
            Criar conta
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              clearFeedback();
            }}
            className={`cursor-pointer rounded-lg py-2 text-[12px] font-bold transition-all ${
              mode === 'login'
                ? 'bg-[#0F0F12] text-white shadow-xs dark:bg-[#991B1B]'
                : 'text-[#52525B] hover:text-[#0F0F12] dark:text-[#A1A1AA] dark:hover:text-white'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('forgot');
              setGeneratedResetLink(null);
              setIsEmailResetStep2(false);
              clearFeedback();
            }}
            className={`cursor-pointer rounded-lg py-2 text-[12px] font-bold transition-all ${
              mode === 'forgot'
                ? 'bg-[#0F0F12] text-white shadow-xs dark:bg-[#991B1B]'
                : 'text-[#52525B] hover:text-[#0F0F12] dark:text-[#A1A1AA] dark:hover:text-white'
            }`}
          >
            Esqueci a senha
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Autenticação Direta com Conta Google (Sem JWT, como entrar no e-mail) */}
          {mode === 'google-direct' && (
            <div className="rounded-2xl border border-[#991B1B]/30 bg-[#FEF2F2] p-4.5 dark:border-[#7F1D1D] dark:bg-[#201014]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-2 3l3.2 2.5c1.9-1.7 3-4.3 3-7.4 0-.7-.1-1.4-.2-2H12z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.9v2.6C4.6 19.8 8 22 12 22z"
                    />
                    <path
                      fill="#4A90E2"
                      d="M6.2 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8V7.6H2.9C2.3 8.9 2 10.4 2 12s.3 3.1.9 4.4l3.3-2.6z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8 2 4.6 4.2 2.9 7.6l3.3 2.6c.8-2.5 3.1-4.3 5.8-4.3z"
                    />
                  </svg>
                  <span className="text-[13px] font-extrabold text-[#991B1B] dark:text-[#FCA5A5]">
                    Entrar com a Conta Google
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="cursor-pointer text-[11px] font-bold text-[#71717A] hover:underline dark:text-[#A1A1AA]"
                >
                  Voltar
                </button>
              </div>

              <p className="mb-3 text-[12px] leading-relaxed text-[#52525B] dark:text-[#D4D4D8]">
                Informe o seu e-mail do Google e a sua senha para autenticar com segurança e
                sincronizar suas tarefas.
              </p>

              <div className="flex flex-col gap-3">
                <Input
                  label="E-mail da sua Conta Google"
                  type="email"
                  placeholder="seu.email@gmail.com"
                  value={googleEmail}
                  onChangeText={setGoogleEmail}
                  autoFocus
                />
                <Input
                  label="Senha da Conta Google"
                  type="password"
                  placeholder="Digite sua senha de acesso"
                  value={googlePassword}
                  onChangeText={setGooglePassword}
                />
                <Input
                  label="Seu Nome (opcional)"
                  placeholder="Ex.: Bruno Vinicius"
                  value={googleName}
                  onChangeText={setGoogleName}
                />
              </div>
            </div>
          )}

          {mode === 'register' && (
            <>
              <Input
                label="Seu nome"
                placeholder="Ex.: Bruno Vinicius"
                value={name}
                onChangeText={setName}
                autoFocus
              />
              <Input
                label="E-mail"
                type="email"
                placeholder="voce@exemplo.com"
                value={email}
                onChangeText={setEmail}
              />
              <Input
                label="Senha"
                type="password"
                placeholder="Mínimo de 6 caracteres"
                value={password}
                onChangeText={setPassword}
              />
              <Input
                label="Palavra-chave de segurança (para recuperar senha)"
                placeholder="Ex.: nome de um vinho ou livro favorito"
                value={recoveryKeyword}
                onChangeText={setRecoveryKeyword}
              />
            </>
          )}

          {mode === 'login' && (
            <>
              <Input
                label="E-mail"
                type="email"
                placeholder="voce@exemplo.com"
                value={email}
                onChangeText={setEmail}
                autoFocus
              />
              <Input
                label="Senha"
                type="password"
                placeholder="Sua senha de acesso"
                value={password}
                onChangeText={setPassword}
              />
            </>
          )}

          {mode === 'forgot' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod('keyword');
                    clearFeedback();
                  }}
                  className={`cursor-pointer rounded-xl border py-2 text-[12px] font-bold transition-all ${
                    recoveryMethod === 'keyword'
                      ? 'border-[#991B1B] bg-[#991B1B]/10 text-[#991B1B] dark:text-[#FCA5A5]'
                      : 'border-[#E2DDD5] text-[#52525B] dark:border-[#2E2E34] dark:text-[#A1A1AA]'
                  }`}
                >
                  🔑 Palavra-Chave
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMethod('email');
                    setGeneratedResetLink(null);
                    setIsEmailResetStep2(false);
                    clearFeedback();
                  }}
                  className={`cursor-pointer rounded-xl border py-2 text-[12px] font-bold transition-all ${
                    recoveryMethod === 'email'
                      ? 'border-[#991B1B] bg-[#991B1B]/10 text-[#991B1B] dark:text-[#FCA5A5]'
                      : 'border-[#E2DDD5] text-[#52525B] dark:border-[#2E2E34] dark:text-[#A1A1AA]'
                  }`}
                >
                  ✉️ Link no E-mail
                </button>
              </div>

              <Input
                label="Seu e-mail cadastrado"
                type="email"
                placeholder="voce@exemplo.com"
                value={email}
                onChangeText={setEmail}
              />

              {recoveryMethod === 'keyword' ? (
                <>
                  <Input
                    label="Qual é a sua palavra-chave de segurança?"
                    placeholder="Digite sua palavra-chave cadastrada"
                    value={recoveryKeyword}
                    onChangeText={setRecoveryKeyword}
                  />
                  <Input
                    label="Nova senha segura"
                    type="password"
                    placeholder="Mínimo de 6 caracteres"
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                </>
              ) : isEmailResetStep2 ? (
                <Input
                  label="Defina sua nova senha"
                  type="password"
                  placeholder="Mínimo de 6 caracteres"
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
              ) : null}
            </>
          )}

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-[#FDECEC] px-3.5 py-2.5 text-[13px] font-semibold text-[#B91C1C] dark:bg-[#3B1219] dark:text-[#FCA5A5]"
            >
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[#991B1B]/30 bg-[#FEF2F2] p-3.5 text-[12px] text-[#7F1D1D] dark:bg-[#271518] dark:text-[#FCA5A5]">
              <p className="font-semibold">{successMessage}</p>
              {generatedResetLink && !isEmailResetStep2 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEmailResetStep2(true)}
                    className="cursor-pointer rounded-lg bg-[#991B1B] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#7F1D1D]"
                  >
                    Criar nova senha agora
                  </button>
                  <a
                    href={`mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(
                      'Recuperação de Senha — B.V.S Special',
                    )}&body=${encodeURIComponent(
                      `Olá,\n\nUse este link para redefinir sua senha no B.V.S Special:\n${generatedResetLink}`,
                    )}`}
                    className="rounded-lg border border-[#991B1B] px-3 py-1.5 text-[12px] font-bold text-[#991B1B] dark:text-[#FCA5A5]"
                  >
                    Abrir App de E-mail
                  </a>
                </div>
              )}
            </div>
          ) : null}

          {dbEngine === 'static-no-backend' ? (
            <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#9A3412] dark:border-[#7C2D12] dark:bg-[#25140F] dark:text-[#FDBA74]">
              <strong>⚠️ Atenção (Modo Estático no Render):</strong> o serviço atual está publicado
              como <em>Static Site</em> (sem servidor SQL ativo). Para que o login funcione em
              qualquer celular e computador sem recriar conta, ative o{' '}
              <strong>Web Service Node + PostgreSQL (DATABASE_URL)</strong> no painel do Render.
            </div>
          ) : (
            <div className="rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#3F3F46] dark:border-[#27272A] dark:bg-[#1C1C22] dark:text-[#A1A1AA]">
              {dbEngine === 'postgresql' ? (
                <>
                  🟢 <strong>Banco SQL PostgreSQL Conectado:</strong> sua conta e tarefas ficam
                  salvas permanentemente e acessíveis em qualquer computador, iPhone ou Android.
                </>
              ) : (
                <>
                  ✓ <strong>Acesso seguro multi-dispositivo:</strong> sessão criptografada com
                  sincronização SQL central e proteção offline local.
                </>
              )}
            </div>
          )}

          <Button type="submit" className="w-full">
            {mode === 'google-direct'
              ? 'Autenticar com o Google'
              : mode === 'register'
                ? 'Criar conta e acessar'
                : mode === 'login'
                  ? 'Entrar no B.V.S Special'
                  : recoveryMethod === 'keyword' || isEmailResetStep2
                    ? 'Redefinir senha e entrar'
                    : 'Enviar link para o e-mail'}
          </Button>
        </form>

        {/* Rodapé Executivo com Ano Dinâmico Automático (2026 -> 2027 -> ...) */}
        <footer className="mt-6 border-t border-[#E5E4E0] pt-4 text-center text-[11px] font-semibold text-[#71717A] dark:border-[#27272A] dark:text-[#A1A1AA]">
          <p>
            <span className="font-extrabold text-[#991B1B] dark:text-[#F87171]">B.V.S Special</span>{' '}
            — Created By{' '}
            <span className="font-bold text-[#0F0F12] dark:text-[#FAFAFA]">Gustavo Geraldo</span> ©{' '}
            <span>{new Date().getFullYear()}</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
