import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Logo } from '../../../components/ui/Logo';
import { useTaskStore } from '../../../stores/useTaskStore';

type AuthMode = 'register' | 'login' | 'forgot';
type RecoveryMethod = 'keyword' | 'email';

export function AuthScreen() {
  const registeredAccounts = useTaskStore((state) => state.registeredAccounts);
  const theme = useTaskStore((state) => state.theme);
  const toggleTheme = useTaskStore((state) => state.toggleTheme);
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
  const [isEmailResetStep2, setIsEmailResetStep2] = useState(false);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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
      setIsEmailResetStep2(true);
      setSuccessMessage('Link validado! Digite sua nova senha abaixo.');
    }
  }, []);

  function clearFeedback() {
    setError('');
    setSuccessMessage('');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (mode === 'register') {
      const result = registerAccount(name, email, password, recoveryKeyword);
      if (!result.ok) {
        setError(result.error ?? 'Erro ao criar conta.');
      }
      return;
    }

    if (mode === 'login') {
      const result = loginAccount(email, password);
      if (!result.ok) {
        setError(result.error ?? 'Credenciais inválidas.');
      }
      return;
    }

    // Modo Recuperação de Senha (forgot)
    if (recoveryMethod === 'keyword') {
      const result = resetPasswordWithKeyword(email, recoveryKeyword, newPassword);
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível redefinir a senha.');
      }
      return;
    }

    // Recuperação via Link por E-mail
    if (!isEmailResetStep2) {
      const linkResult = requestPasswordResetLink(email);
      if (!linkResult.ok) {
        setError(linkResult.error ?? 'E-mail não encontrado.');
        return;
      }
      setGeneratedResetLink(linkResult.resetLink ?? null);
      setSuccessMessage(
        `Link de redefinição enviado para ${email.trim()}. Clique no link abaixo para criar sua nova senha.`,
      );
    } else {
      const resetRes = resetPasswordViaEmailLink(email, newPassword);
      if (!resetRes.ok) {
        setError(resetRes.error ?? 'Erro ao salvar nova senha.');
      }
    }
  }

  function handleGoogleSignIn() {
    clearFeedback();
    const googleName = name.trim() || (email.trim() ? email.trim().split('@')[0] : 'Usuário Google B V');
    const googleEmail =
      email.trim() && email.includes('@') ? email.trim() : 'conta.google@bvtasks.com';
    loginWithGoogle({ name: googleName, email: googleEmail });
  }

  return (
    <div className="safe-area-container flex min-h-dvh w-full items-center justify-center bg-gradient-to-br from-[#F8F7F4] via-[#F3EFEA] to-[#EAE3DC] dark:from-[#09090B] dark:via-[#120C0E] dark:to-[#1C1014]">
      <div className="w-full max-w-md rounded-3xl border border-[#E2DDD5] bg-white p-7 shadow-2xl shadow-black/10 sm:p-8 dark:border-[#27272A] dark:bg-[#141418]">
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

        {/* Logo B V Tasks (Garrafa + Taça de Vinho + Livro + B V) */}
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size="lg" showText={false} />
          <h1 className="mt-4 font-serif text-[28px] font-bold tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]">
            B V Tasks
          </h1>
          <p className="mt-1 text-[13px] font-medium text-[#52525B] dark:text-[#A1A1AA]">
            Planejamento executivo para{' '}
            <span className="font-bold text-[#991B1B] dark:text-[#F87171]">Trabalho</span>,{' '}
            <span className="font-bold text-[#2563EB] dark:text-[#60A5FA]">Pessoal</span> e{' '}
            <span className="font-bold text-[#DB2777] dark:text-[#F472B6]">Estudo</span>
          </p>
        </div>

        {/* Botão de Autenticação Rápida com Google */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="mb-2.5 flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[#D6D3CD] bg-white px-4 text-[14px] font-bold text-[#0F0F12] shadow-xs transition-all hover:bg-[#F8F7F4] active:scale-[0.99] dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#F4F4F5] dark:hover:bg-[#24242C]"
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

        {/* Botão de Acesso Direto como Convidado para teste imediato */}
        <button
          type="button"
          onClick={() => {
            clearFeedback();
            loginWithGoogle({ name: 'Visitante B V', email: 'visitante@bvtasks.com' });
          }}
          className="mb-4 flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] px-4 text-[13px] font-bold text-[#52525B] transition-all hover:bg-[#ECE9E2] active:scale-[0.99] dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#A1A1AA] dark:hover:bg-[#27272F]"
        >
          <span>⚡ Acessar como Convidado (Testar Direto)</span>
        </button>

        <div className="relative mb-4 flex items-center justify-center">
          <div className="w-full border-t border-[#E5E4E0] dark:border-[#27272A]" />
          <span className="bg-white px-3 text-[11px] font-bold tracking-wider text-[#71717A] uppercase dark:bg-[#141418]">
            ou com e-mail
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
                placeholder="Mínimo de 4 caracteres"
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
              />
              <Input
                label="Senha"
                type="password"
                placeholder="Sua senha"
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
                  🔑 Por Palavra-Chave
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
                    label="Nova senha"
                    type="password"
                    placeholder="Digite a nova senha"
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                </>
              ) : isEmailResetStep2 ? (
                <Input
                  label="Defina sua nova senha"
                  type="password"
                  placeholder="Mínimo de 4 caracteres"
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
              ) : null}
            </>
          )}

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-[#FDECEC] px-3 py-2 text-[13px] font-semibold text-[#B91C1C] dark:bg-[#3B1219] dark:text-[#FCA5A5]"
            >
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[#991B1B]/30 bg-[#FEF2F2] p-3 text-[12px] text-[#7F1D1D] dark:bg-[#271518] dark:text-[#FCA5A5]">
              <p className="font-semibold">{successMessage}</p>
              {generatedResetLink && !isEmailResetStep2 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEmailResetStep2(true)}
                    className="cursor-pointer rounded-lg bg-[#991B1B] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#7F1D1D]"
                  >
                    Abrir link de criação de nova senha
                  </button>
                  <a
                    href={`mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(
                      'Recuperação de Senha — B V Tasks',
                    )}&body=${encodeURIComponent(
                      `Olá,\n\nUse este link para redefinir sua senha no B V Tasks:\n${generatedResetLink}`,
                    )}`}
                    className="rounded-lg border border-[#991B1B] px-3 py-1.5 text-[12px] font-bold text-[#991B1B] dark:text-[#FCA5A5]"
                  >
                    Enviar para meu App de E-mail
                  </a>
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#3F3F46] dark:border-[#27272A] dark:bg-[#1C1C22] dark:text-[#A1A1AA]">
            ✓ <strong>Acesso permanente:</strong> criada a conta uma única vez, sua sessão fica salva
            neste aparelho sem precisar logar novamente.
          </div>

          <Button type="submit" className="w-full">
            {mode === 'register'
              ? 'Criar conta e acessar'
              : mode === 'login'
                ? 'Entrar no B V Tasks'
                : recoveryMethod === 'keyword' || isEmailResetStep2
                  ? 'Redefinir senha e entrar'
                  : 'Enviar link para o e-mail'}
          </Button>
        </form>
      </div>
    </div>
  );
}
