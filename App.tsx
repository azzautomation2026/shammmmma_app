
import React, { useState, useEffect } from 'react';
import { InputType, AppState, Difficulty, QuizMode, Language, User, Question, QuizResponse } from './types';
import { generateQuiz } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { translations } from './translations';

const App: React.FC = () => {
  const [state, setState] = useState<AppState & { view: 'landing' | 'dashboard' | 'create' | 'quiz' | 'settings' | 'auth' | 'payment', initialLoading: boolean }>({
    inputType: InputType.TEXT,
    difficulty: 'medium',
    quizMode: 'interactive',
    language: 'ar',
    questionCount: 5,
    content: '',
    file: null,
    isLoading: false,
    initialLoading: true,
    quiz: null,
    savedQuizzes: [],
    error: null,
    userAnswers: {},
    showResults: false,
    view: 'landing',
    isLoggedIn: false,
    user: null,
    authMode: 'login'
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const currentLang = translations[state.language] || translations['ar'];
  const t = currentLang;

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserFromSession(session);
      } else {
        setState(prev => ({ ...prev, initialLoading: false }));
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUserFromSession(session);
      } else {
        setState(prev => ({ ...prev, isLoggedIn: false, user: null, view: 'landing', initialLoading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setUserFromSession = (session: any) => {
    const user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.user_metadata.full_name || session.user.email?.split('@')[0] || 'User'
    };
    
    setState(prev => ({ 
      ...prev, 
      isLoggedIn: true, 
      user, 
      view: prev.view === 'payment' ? 'payment' : 'dashboard', 
      initialLoading: false 
    }));
    fetchSavedQuizzes(session.user.id);
  };

  const fetchSavedQuizzes = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const formattedQuizzes = data.map(q => ({
          id: q.id,
          ...q.quiz_data,
          created_at: q.created_at
        }));
        setState(prev => ({ ...prev, savedQuizzes: formattedQuizzes }));
      }
    } catch (err) {
      console.error("Error fetching quizzes:", err);
    }
  };

  useEffect(() => {
    document.documentElement.dir = t.dir;
    document.documentElement.lang = state.language;
  }, [state.language, t.dir]);

  const goToHome = () => {
    if (state.isLoggedIn) {
      setState(prev => ({
        ...prev,
        quiz: null,
        content: '',
        file: null,
        showResults: false,
        userAnswers: {},
        view: 'dashboard',
        error: null
      }));
    } else {
      setState(prev => ({
        ...prev,
        view: 'landing',
        error: null
      }));
    }
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const name = formData.get('name') as string;

    try {
      if (state.authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } }
        });
        if (error) throw error;
        setState(prev => ({ ...prev, view: 'payment', isLoading: false }));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message, isLoading: false }));
    }
  };

  const startGeneration = async () => {
    if (!state.content.trim()) {
      setState(prev => ({ ...prev, error: t.error_empty }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const quiz = await generateQuiz(
        state.content,
        state.inputType,
        state.difficulty,
        state.language,
        state.questionCount
      );

      let finalQuiz = { ...quiz };

      if (state.isLoggedIn && state.user) {
        const { data, error } = await supabase
          .from('quizzes')
          .insert({
            user_id: state.user.id,
            quiz_data: quiz,
            title: quiz.title
          })
          .select()
          .single();

        if (!error && data) {
          finalQuiz = { ...quiz, id: data.id, created_at: data.created_at };
          setState(prev => ({ 
            ...prev, 
            savedQuizzes: [finalQuiz, ...prev.savedQuizzes] 
          }));
        }
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        quiz: finalQuiz,
        view: 'quiz',
        userAnswers: {},
        showResults: false
      }));
    } catch (err: any) {
      setState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setState(prev => ({ ...prev, isLoggedIn: false, user: null, view: 'landing' }));
    setIsMobileMenuOpen(false);
  };

  const ShamaaLogo = ({ size = "medium" }: { size?: "small" | "medium" | "large" }) => {
    const dimensions = size === "small" ? "w-10 h-10" : size === "large" ? "w-32 h-32" : "w-16 h-16";
    return (
      <div className={`${dimensions} shamaa-logo-container relative flex items-center justify-center`}>
        <svg viewBox="0 0 100 100" className="w-full h-full">
           <defs>
             <linearGradient id="flameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
               <stop offset="0%" stopColor="#f5ba42" />
               <stop offset="100%" stopColor="#ef6c00" />
             </linearGradient>
           </defs>
           <path d="M40 70 L60 70 L60 90 L40 90 Z" fill="#d4af37" />
           <path d="M40 70 Q50 65 60 70 L60 75 Q50 70 40 75 Z" fill="#b8860b" />
           <path d="M50 20 C35 35 35 55 50 65 C65 55 65 35 50 20 Z" fill="url(#flameGrad)" />
           <path d="M45 40 Q40 40 40 45 Q40 50 45 50 Q45 55 50 55 Q55 55 55 50 Q60 50 60 45 Q60 40 55 40 Z" fill="rgba(0,0,0,0.2)" />
        </svg>
      </div>
    );
  };

  const BackButton = () => (
    <button 
      onClick={goToHome}
      className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group no-print"
    >
      <svg className={`w-5 h-5 transition-transform group-hover:${t.dir === 'rtl' ? 'translate-x-1' : '-translate-x-1'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={t.dir === 'rtl' ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
      </svg>
      <span className="font-bold text-sm">{t.home}</span>
    </button>
  );

  if (state.initialLoading) {
    return (
      <div className="min-h-screen bg-[#050e1c] flex items-center justify-center">
        <div className="text-center space-y-6">
           <ShamaaLogo size="large" />
           <div className="animate-pulse text-[#f5ba42] font-black text-xl tracking-[0.2em]">{t.dir === 'rtl' ? 'جاري التحميل...' : 'Loading...'}</div>
        </div>
      </div>
    );
  }

  // Payment View (Fixed Whop Embed)
  if (state.view === 'payment') {
    return (
      <div className="min-h-screen bg-[#040b16] font-tajawal text-white flex flex-col items-center justify-start py-8 md:py-12 px-4 md:px-6 relative overflow-y-auto">
        <div className="absolute inset-0 bg-dashboard-gradient opacity-30 pointer-events-none"></div>
        
        <div className="w-full max-w-4xl z-10 space-y-8 animate-in fade-in zoom-in duration-700">
          <div className="text-center space-y-4">
            <div onClick={goToHome} className="flex justify-center mb-6 cursor-pointer">
               <ShamaaLogo size="large" />
            </div>
            <h1 className="text-3xl md:text-5xl font-black gold-gradient-text tracking-tight">{t.payment_title}</h1>
            <p className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto font-medium">
              {t.payment_desc}
            </p>
          </div>

          <div className="whop-container relative bg-[#0c1425] border border-white/5 rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col min-h-[750px]">
             {/* Progress Bar Simulation */}
             <div className="flex w-full bg-[#080d1a] border-b border-white/5 no-print">
               <div className="flex-1 py-4 text-center text-[10px] font-black uppercase tracking-widest text-[#f5ba42] border-b-2 border-[#f5ba42]">1. الاشتراك</div>
               <div className="flex-1 py-4 text-center text-[10px] font-black uppercase tracking-widest text-gray-600">2. التفعيل</div>
               <div className="flex-1 py-4 text-center text-[10px] font-black uppercase tracking-widest text-gray-600">3. الانطلاق</div>
             </div>

             {/* Official Whop Embed Iframe Implementation */}
             <div className="flex-grow w-full h-[650px] bg-white">
               <iframe 
                  src="https://whop.com/checkout/plan_egSMCAiLiCtyZ?embed=true"
                  title="Whop Checkout"
                  allow="payment; publickey-credentials-get; clipboard-write"
                  className="w-full h-full border-none"
               ></iframe>
             </div>

             <div className="p-6 md:p-8 border-t border-white/5 bg-[#080d1a]/80 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                   </div>
                   <div className="text-start">
                      <div className="text-sm font-black">{t.payment_secure}</div>
                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Powered by Whop Security</div>
                   </div>
                </div>

                <button 
                  onClick={() => setState(prev => ({ ...prev, view: 'dashboard' }))}
                  className="w-full md:w-auto px-10 py-5 bg-white text-black font-black rounded-2xl hover:bg-gray-100 transition-all flex items-center justify-center gap-3 shadow-2xl active:scale-95"
                >
                  <span className="text-base">تم الدفع بنجاح؟ انطلق الآن</span>
                  <svg className={`w-5 h-5 ${t.dir === 'rtl' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </button>
             </div>
          </div>
          
          <div className="text-center">
            <button 
              onClick={goToHome}
              className="text-gray-500 hover:text-white font-bold transition-colors text-sm underline underline-offset-8"
            >
              {t.skip_payment}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // App Dashboard Logic (Sidebars & Navigation)
  const isSidebarVisible = state.view === 'dashboard' || state.view === 'create' || state.view === 'quiz' || state.view === 'settings';

  return (
    <div className={`flex min-h-screen font-tajawal bg-[#050e1c] text-white selection:bg-[#f5ba42]/30`}>
      {/* Sidebar - Desktop */}
      {isSidebarVisible && (
        <aside className="w-64 border-l border-white/5 bg-[#040b16] flex flex-col no-print hidden lg:flex flex-shrink-0">
          <div className="p-8">
            <div className="flex items-center gap-3 mb-10 group cursor-pointer" onClick={goToHome}>
              <ShamaaLogo size="small" />
              <div className="text-2xl font-black gold-gradient-text">{t.logo}</div>
            </div>

            <nav className="space-y-4">
              <button onClick={goToHome} className={`w-full font-bold py-3.5 px-4 rounded-xl flex items-center gap-3 transition-colors border ${state.view === 'dashboard' ? 'bg-white/10 text-white border-white/20' : 'bg-white/5 text-gray-300 border-white/5 hover:bg-white/10'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0 a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                {t.home}
              </button>
              <button onClick={() => setState(prev => ({ ...prev, view: 'create', quiz: null }))} className={`w-full font-black py-4 px-4 rounded-xl flex items-center gap-3 transition-transform active:scale-95 shadow-lg ${state.view === 'create' ? 'bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>
                {t.create_new}
              </button>
              <button onClick={() => setState(prev => ({ ...prev, view: 'dashboard' }))} className={`w-full font-bold py-3.5 px-4 rounded-xl flex items-center gap-3 transition-colors border ${state.view === 'dashboard' ? 'bg-white/10 text-white border-white/20' : 'bg-white/5 text-gray-300 border-white/5 hover:bg-white/10'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"/></svg>
                {t.other_quizzes}
              </button>
            </nav>
          </div>

          <div className="mt-auto p-8">
            <div onClick={handleLogout} className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl group cursor-pointer hover:bg-rose-500/10 transition-colors border border-white/5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f5ba42] to-[#ef6c00] flex items-center justify-center font-black text-white text-xs">
                {state.user?.name.charAt(0) || 'AZ'}
              </div>
              <div className="flex-grow">
                <div className="text-xs font-black text-white truncate max-w-[120px]">{state.user?.name}</div>
                <div className="text-[9px] text-gray-500 font-bold uppercase">{t.logout}</div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Main Container */}
      {!isSidebarVisible ? (
        // For Landing or Auth
        <div className="w-full overflow-y-auto">
          {state.view === 'landing' && (
             <div className="min-h-screen">
                <nav className="h-20 flex items-center justify-between px-6 md:px-20 z-50 relative">
                  <div onClick={goToHome} className="flex items-center gap-3 cursor-pointer group hover:opacity-80 transition-opacity">
                    <ShamaaLogo size="small" />
                    <div className="text-2xl font-black gold-gradient-text tracking-tighter">{t.logo}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'login' }))} className="text-gray-400 hover:text-white font-bold transition-colors text-sm">{t.login}</button>
                    <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'signup' }))} className="px-6 py-2.5 bg-white text-black font-black rounded-xl text-xs hover:scale-105 transition-all shadow-xl shadow-white/5">{t.signup}</button>
                  </div>
                </nav>
                <section className="relative pt-20 pb-32 px-6 overflow-hidden">
                  <div className="absolute inset-0 bg-dashboard-gradient opacity-20 pointer-events-none"></div>
                  <div className="max-w-5xl mx-auto text-center space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                    <h1 className="text-5xl md:text-7xl font-black leading-tight tracking-tight">{t.hero_title}</h1>
                    <p className="text-gray-400 text-lg md:text-2xl max-w-3xl mx-auto leading-relaxed font-medium">{t.hero_desc}</p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
                      <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'signup' }))} className="w-full sm:w-auto px-12 py-5 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] rounded-2xl font-black text-xl shadow-[0_20px_60px_rgba(239,108,0,0.3)] hover:scale-105 transition-all">{t.get_started}</button>
                    </div>
                  </div>
                </section>
             </div>
          )}
          {state.view === 'auth' && (
             <div className="min-h-screen flex items-center justify-center p-6 relative bg-[#040b16]">
                <div className="absolute inset-0 bg-dashboard-gradient opacity-30 pointer-events-none"></div>
                <div className="max-w-md w-full z-10 space-y-8 animate-in fade-in zoom-in duration-500">
                  <button onClick={goToHome} className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors group mb-4">
                    <svg className={`w-5 h-5 transition-transform group-hover:${t.dir === 'rtl' ? 'translate-x-1' : '-translate-x-1'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={t.dir === 'rtl' ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} /></svg>
                    <span className="font-bold text-sm">{t.home}</span>
                  </button>
                  <div className="text-center space-y-4">
                    <div onClick={goToHome} className="flex justify-center mb-6 cursor-pointer"><ShamaaLogo size="large" /></div>
                    <h1 className="text-4xl md:text-5xl font-black gold-gradient-text tracking-tight">{state.authMode === 'login' ? t.welcome_back : t.join_shama}</h1>
                  </div>
                  <form onSubmit={handleAuth} className="bg-[#0c1425] border border-white/5 rounded-[40px] p-6 md:p-10 shadow-[0_40px_100px_rgba(0,0,0,0.6)] space-y-6">
                    {state.authMode === 'signup' && (
                      <div className="space-y-2"><label className="text-[10px] uppercase tracking-widest text-gray-500 font-black px-1">{t.name}</label><input type="text" name="name" required className="w-full bg-[#040b16] border border-white/5 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-[#f5ba42]/20 outline-none" placeholder={t.name} /></div>
                    )}
                    <div className="space-y-2"><label className="text-[10px] uppercase tracking-widest text-gray-500 font-black px-1">{t.email}</label><input type="email" name="email" required className="w-full bg-[#040b16] border border-white/5 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-[#f5ba42]/20 outline-none" placeholder="name@email.com" /></div>
                    <div className="space-y-2"><label className="text-[10px] uppercase tracking-widest text-gray-500 font-black px-1">{t.password}</label><input type="password" name="password" required className="w-full bg-[#040b16] border border-white/5 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-[#f5ba42]/20 outline-none" placeholder="••••••••" /></div>
                    {state.error && <div className="text-rose-500 text-xs font-bold text-center bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">{state.error}</div>}
                    <button type="submit" disabled={state.isLoading} className="w-full py-5 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] text-white font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3">
                      {state.isLoading && <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                      {state.authMode === 'login' ? t.login : t.signup}
                    </button>
                    <div className="pt-4 text-center">
                      <button type="button" onClick={() => setState(prev => ({ ...prev, authMode: prev.authMode === 'login' ? 'signup' : 'login' }))} className="text-xs font-bold text-gray-400 hover:text-white">{state.authMode === 'login' ? t.dont_have_account : t.already_have_account} <span className="text-[#f5ba42] mr-1">{state.authMode === 'login' ? t.signup : t.login}</span></button>
                    </div>
                  </form>
                </div>
             </div>
          )}
        </div>
      ) : (
        // Dashboard Content
        <div className="flex-grow flex flex-col h-screen overflow-hidden relative">
          <div className="absolute inset-0 bg-dashboard-gradient pointer-events-none"></div>
          <header className="h-20 md:h-24 flex items-center justify-between px-6 md:px-10 z-20 no-print flex-shrink-0 bg-[#050e1c]/80 backdrop-blur-lg lg:bg-transparent">
            <div className="flex items-center gap-4 lg:hidden">
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-white hover:bg-white/5 rounded-lg transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg></button>
              <div onClick={goToHome} className="flex items-center gap-2 cursor-pointer group"><ShamaaLogo size="small" /><div className="text-xl font-black gold-gradient-text">{t.logo}</div></div>
            </div>
            <div className="relative w-full max-w-[300px] hidden sm:block"><input type="text" placeholder={t.search} className={`w-full bg-[#0c1425] border border-white/5 rounded-2xl py-3 px-6 text-sm outline-none focus:ring-2 focus:ring-[#f5ba42]/20 transition-all`} /></div>
            <div className="flex items-center gap-4"><button onClick={() => setState(prev => ({ ...prev, view: 'create', quiz: null }))} className="bg-white text-black font-black px-6 py-3 rounded-xl hover:scale-105 transition-all text-sm shadow-xl shadow-white/5">{t.create}</button></div>
          </header>

          <div className="flex-grow overflow-y-auto px-6 md:px-10 pb-40 z-10 relative custom-scrollbar">
            {state.view === 'dashboard' && (
              <div className="py-10 animate-in fade-in duration-700">
                {state.savedQuizzes.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto pt-20">
                    <h2 className="text-4xl font-black text-[#f5ba42] mb-4">{t.no_projects}</h2>
                    <p className="text-gray-400 text-lg mb-10">{t.no_projects_desc}</p>
                    <button onClick={() => setState(prev => ({ ...prev, view: 'create' }))} className="px-12 py-5 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] rounded-2xl font-black text-white shadow-2xl">{t.create_new}</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {state.savedQuizzes.map((q) => (
                      <div key={q.id} onClick={() => setState(prev => ({ ...prev, quiz: q, view: 'quiz' }))} className="bg-[#0c1425] border border-white/5 p-8 rounded-[32px] hover:border-[#f5ba42]/30 transition-all cursor-pointer group animate-in zoom-in">
                        <h3 className="text-xl font-black mb-3 line-clamp-2 group-hover:text-[#f5ba42] transition-colors">{q.title}</h3>
                        <p className="text-gray-500 text-sm line-clamp-3 mb-6 leading-relaxed">{q.description}</p>
                        <div className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{new Date(q.created_at || '').toLocaleDateString('ar-SA')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {state.view === 'create' && (
              <div className="max-w-4xl mx-auto py-10 space-y-12 animate-in slide-in-from-bottom-10">
                <BackButton />
                <div className="bg-[#0c1425] rounded-[40px] border border-white/5 overflow-hidden shadow-2xl">
                   <div className="flex bg-[#080d1a] border-b border-white/5">
                      {(Object.keys(InputType) as Array<keyof typeof InputType>).map((type) => (
                        <button key={type} onClick={() => setState(prev => ({ ...prev, inputType: InputType[type], content: '', error: null }))} className={`flex-1 py-5 text-[11px] font-black tracking-widest uppercase transition-all ${state.inputType === InputType[type] ? 'text-[#f5ba42] border-b-2 border-[#f5ba42]' : 'text-gray-500 hover:text-gray-300'}`}>{t[type.toLowerCase() as keyof typeof t]}</button>
                      ))}
                   </div>
                   <div className="p-10 space-y-8">
                      {state.inputType === InputType.TEXT && (
                        <textarea value={state.content} onChange={(e) => setState(prev => ({ ...prev, content: e.target.value }))} placeholder={t.placeholder_text} className="w-full h-64 bg-[#040b16] p-8 rounded-[32px] border border-white/5 outline-none focus:ring-2 focus:ring-[#f5ba42]/20 resize-none text-gray-100 text-lg leading-relaxed shadow-inner" />
                      )}
                      <button onClick={startGeneration} disabled={state.isLoading} className="w-full py-6 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] rounded-[24px] font-black text-white shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-4">
                        {state.isLoading ? (
                           <><svg className="animate-spin h-6 w-6" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>{t.generating}</span></>
                        ) : t.generate}
                      </button>
                   </div>
                </div>
              </div>
            )}

            {state.view === 'quiz' && state.quiz && (
              <div className="max-w-5xl mx-auto py-10 space-y-12 animate-in fade-in">
                 <BackButton />
                 <div className="bg-[#0c1425] p-12 rounded-[48px] border border-white/5 text-center relative shadow-2xl overflow-hidden">
                   <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00]"></div>
                   <h2 className="text-4xl md:text-5xl font-black mb-6 gold-gradient-text">{state.quiz.title}</h2>
                   <p className="text-gray-400 text-lg md:text-xl leading-relaxed max-w-3xl mx-auto">{state.quiz.description}</p>
                 </div>
                 
                 <div className="space-y-10">
                   {state.quiz.questions.map((q, idx) => (
                     <div key={q.id} className="bg-[#0c1425] p-8 md:p-12 rounded-[40px] border border-white/5 shadow-xl">
                        <h3 className="text-2xl font-black mb-8 flex gap-4"><span className="w-10 h-10 bg-[#f5ba42]/10 rounded-xl flex items-center justify-center text-[#f5ba42] text-sm flex-shrink-0">{idx + 1}</span>{q.question}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {q.options.map((opt, oIdx) => (
                            <button 
                              key={oIdx} 
                              onClick={() => !state.showResults && setState(prev => ({...prev, userAnswers: {...prev.userAnswers, [q.id]: oIdx}}))}
                              className={`p-6 rounded-2xl border-2 text-start transition-all font-bold ${state.userAnswers[q.id] === oIdx ? 'bg-[#f5ba42] text-white border-[#f5ba42]' : 'bg-[#040b16] border-white/5 text-gray-400 hover:border-white/20'}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        {state.showResults && (
                          <div className="mt-8 p-6 bg-[#2ecc71]/5 border border-[#2ecc71]/20 rounded-2xl text-[#2ecc71] font-medium leading-relaxed">
                            {q.explanation}
                          </div>
                        )}
                     </div>
                   ))}
                   {!state.showResults && (
                     <button onClick={() => setState(prev => ({...prev, showResults: true}))} className="w-full py-6 bg-emerald-500 text-white font-black text-xl rounded-3xl shadow-xl shadow-emerald-500/10 active:scale-95 transition-all">إنهاء الاختبار وعرض النتائج</button>
                   )}
                 </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
