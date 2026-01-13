
import React, { useState, useEffect } from 'react';
import { InputType, AppState, Difficulty, QuizMode, Language, User, Question, QuizResponse } from './types';
import { generateQuiz } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { translations } from './translations';

// مكوّن محاكاة لـ WhopCheckoutEmbed لضمان التوافق مع البيئة الحالية
const WhopCheckoutEmbed: React.FC<{ planId: string, returnUrl: string }> = ({ planId, returnUrl }) => {
  return (
    <div className="whop-container w-full h-[650px] bg-white rounded-3xl overflow-hidden shadow-2xl">
      <iframe 
        src={`https://whop.com/checkout/${planId}?embed=true&return_url=${encodeURIComponent(returnUrl)}`}
        title="Whop Checkout"
        allow="payment; publickey-credentials-get; clipboard-write"
        className="w-full h-full border-none"
      ></iframe>
    </div>
  );
};

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
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setUserFromSession(session);
        } else {
          setState(prev => ({ ...prev, initialLoading: false }));
        }
      } catch (err) {
        console.error("Auth init failed:", err);
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
      view: prev.view === 'payment' ? 'payment' : (prev.view === 'landing' || prev.view === 'auth' ? 'dashboard' : prev.view), 
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
      setState(prev => ({ ...prev, view: 'dashboard', quiz: null, error: null }));
    } else {
      setState(prev => ({ ...prev, view: 'landing', error: null }));
    }
    setIsMobileMenuOpen(false);
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
        // بعد التسجيل نطلب منه الدفع
        setState(prev => ({ ...prev, view: 'payment', isLoading: false }));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message, isLoading: false }));
    }
  };

  // Fix: Added handleLogout to handle user sign out
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Fix: Added startGeneration to handle quiz generation and storage
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

      let savedQuiz = { ...quiz };

      if (state.isLoggedIn && state.user) {
        const { data, error } = await supabase
          .from('quizzes')
          .insert([
            {
              user_id: state.user.id,
              quiz_data: quiz
            }
          ])
          .select();

        if (error) throw error;
        if (data && data[0]) {
          savedQuiz = {
            id: data[0].id,
            ...data[0].quiz_data,
            created_at: data[0].created_at
          };
          fetchSavedQuizzes(state.user.id);
        }
      }

      setState(prev => ({
        ...prev,
        quiz: savedQuiz,
        view: 'quiz',
        isLoading: false,
        showResults: false,
        userAnswers: {}
      }));
    } catch (err: any) {
      console.error("Quiz generation failed:", err);
      setState(prev => ({ 
        ...prev, 
        error: err.message || (state.language === 'ar' ? "فشل في إنشاء الاختبار" : "Failed to generate quiz"), 
        isLoading: false 
      }));
    }
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

  if (state.initialLoading) {
    return (
      <div className="min-h-screen bg-[#050e1c] flex flex-col items-center justify-center">
        <ShamaaLogo size="large" />
        <div className="mt-8 animate-pulse text-[#f5ba42] font-black text-xl tracking-widest">{t.dir === 'rtl' ? 'جاري التحميل...' : 'Loading...'}</div>
      </div>
    );
  }

  // --- Views Implementation ---

  const renderLanding = () => (
    <div className="w-full flex flex-col">
      <nav className="h-24 flex items-center justify-between px-6 md:px-20 z-50 sticky top-0 bg-[#050e1c]/80 backdrop-blur-md border-b border-white/5">
        <div onClick={goToHome} className="flex items-center gap-3 cursor-pointer group">
          <ShamaaLogo size="small" />
          <div className="text-2xl font-black gold-gradient-text tracking-tighter">{t.logo}</div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'login' }))} className="text-gray-400 hover:text-white font-bold transition-colors text-sm px-4">{t.login}</button>
          <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'signup' }))} className="px-8 py-3 bg-white text-black font-black rounded-2xl text-sm hover:scale-105 transition-all shadow-xl shadow-white/5">{t.signup}</button>
        </div>
      </nav>

      <section className="relative pt-32 pb-48 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-dashboard-gradient opacity-20 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto space-y-10 relative z-10 animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <div className="inline-block px-4 py-1.5 bg-[#f5ba42]/10 border border-[#f5ba42]/20 rounded-full text-[#f5ba42] text-xs font-black tracking-widest uppercase mb-4">{t.slogan}</div>
          <h1 className="text-5xl md:text-8xl font-black leading-tight tracking-tight">{t.hero_title}</h1>
          <p className="text-gray-400 text-lg md:text-2xl max-w-3xl mx-auto leading-relaxed font-medium">{t.hero_desc}</p>
          <div className="pt-10">
            <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'signup' }))} className="px-16 py-6 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] rounded-[32px] font-black text-2xl shadow-[0_20px_60px_rgba(239,108,0,0.4)] hover:scale-105 transition-all">
              {t.get_started}
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-32 px-6 bg-[#040b16]/50 border-y border-white/5">
         <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { title: t.feat_1_title, desc: t.feat_1_desc, icon: '⚡' },
              { title: t.feat_2_title, desc: t.feat_2_desc, icon: '🌍' },
              { title: t.feat_3_title, desc: t.feat_3_desc, icon: '📂' }
            ].map((feat, i) => (
              <div key={i} className="bg-[#0c1425] p-12 rounded-[48px] border border-white/5 hover:border-[#f5ba42]/20 transition-all text-center">
                 <div className="text-5xl mb-8">{feat.icon}</div>
                 <h3 className="text-2xl font-black mb-4">{feat.title}</h3>
                 <p className="text-gray-500 font-medium leading-relaxed">{feat.desc}</p>
              </div>
            ))}
         </div>
      </section>

      {/* Pricing */}
      <section className="py-32 px-6 text-center">
        <h2 className="text-4xl md:text-5xl font-black mb-16">{t.pricing_title}</h2>
        <div className="max-w-md mx-auto bg-[#0c1425] border-2 border-[#f5ba42] rounded-[56px] p-16 shadow-2xl relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-2 bg-[#f5ba42] text-black font-black text-xs rounded-full uppercase tracking-widest shadow-xl">Best Value</div>
          <h3 className="text-3xl font-black mb-6">{t.package_name}</h3>
          <div className="flex justify-center items-center gap-4 mb-10">
            <span className="text-gray-600 line-through text-2xl">{t.price_before}</span>
            <span className="text-6xl font-black gold-gradient-text">{t.price_after}</span>
          </div>
          <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'signup' }))} className="w-full py-6 bg-white text-black font-black text-xl rounded-[32px] hover:bg-gray-100 transition-all shadow-xl">{t.get_started}</button>
          <div className="mt-8 text-gray-500 text-sm font-bold">{t.coupon_label} <span className="text-[#f5ba42]">{t.coupon_code}</span></div>
        </div>
      </section>

      <footer className="py-20 text-center text-gray-600 font-medium border-t border-white/5">
        <p>{t.footer_rights}</p>
      </footer>
    </div>
  );

  const renderAuth = () => (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#040b16] relative overflow-hidden">
      <div className="absolute inset-0 bg-dashboard-gradient opacity-30"></div>
      <div className="max-w-md w-full z-10 space-y-8 animate-in zoom-in duration-500">
        <div className="text-center">
          <div className="flex justify-center mb-8 cursor-pointer" onClick={goToHome}><ShamaaLogo size="large" /></div>
          <h1 className="text-4xl font-black gold-gradient-text mb-4">{state.authMode === 'login' ? t.welcome_back : t.join_shama}</h1>
          <p className="text-gray-500 font-medium">{t.auth_desc}</p>
        </div>
        <form onSubmit={handleAuth} className="bg-[#0c1425] border border-white/5 rounded-[48px] p-10 shadow-2xl space-y-6">
          {state.authMode === 'signup' && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 font-black px-1">{t.name}</label>
              <input type="text" name="name" required className="w-full bg-[#040b16] border border-white/5 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-[#f5ba42]/20 outline-none" placeholder={t.name} />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-black px-1">{t.email}</label>
            <input type="email" name="email" required className="w-full bg-[#040b16] border border-white/5 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-[#f5ba42]/20 outline-none" placeholder="example@mail.com" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-black px-1">{t.password}</label>
            <input type="password" name="password" required className="w-full bg-[#040b16] border border-white/5 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-[#f5ba42]/20 outline-none" placeholder="••••••••" />
          </div>
          {state.error && <div className="text-rose-500 text-xs font-bold text-center bg-rose-500/5 p-4 rounded-2xl border border-rose-500/10">{state.error}</div>}
          <button type="submit" disabled={state.isLoading} className="w-full py-5 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] text-white font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl flex items-center justify-center">
            {state.isLoading ? '...' : (state.authMode === 'login' ? t.login : t.signup)}
          </button>
          <div className="text-center pt-4">
            <button type="button" onClick={() => setState(prev => ({ ...prev, authMode: prev.authMode === 'login' ? 'signup' : 'login' }))} className="text-xs font-bold text-gray-400">
              {state.authMode === 'login' ? t.dont_have_account : t.already_have_account} <span className="text-[#f5ba42] ml-1">{state.authMode === 'login' ? t.signup : t.login}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderPayment = () => (
    <div className="min-h-screen bg-[#040b16] flex flex-col items-center justify-center py-12 px-6 relative">
      <div className="max-w-4xl w-full z-10 space-y-12 animate-in fade-in duration-700">
        <div className="text-center space-y-4">
           <div onClick={goToHome} className="flex justify-center mb-8 cursor-pointer"><ShamaaLogo size="large" /></div>
           <h1 className="text-4xl md:text-6xl font-black gold-gradient-text">{t.payment_title}</h1>
           <p className="text-gray-400 text-lg md:text-xl font-medium max-w-2xl mx-auto">{t.payment_desc}</p>
        </div>
        
        {/* Whop Checkout Integration */}
        <WhopCheckoutEmbed 
          planId="plan_egSMCAiLiCtyZ" 
          returnUrl={window.location.origin} 
        />

        <div className="flex flex-col items-center gap-6">
           <div className="flex items-center gap-4 text-emerald-500 font-bold">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              <span>{t.payment_secure}</span>
           </div>
           <button onClick={() => setState(prev => ({ ...prev, view: 'dashboard' }))} className="text-gray-500 hover:text-white font-bold underline underline-offset-8 transition-colors">{t.skip_payment}</button>
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="flex-grow flex flex-col min-h-screen">
      <header className="h-24 flex items-center justify-between px-6 md:px-12 border-b border-white/5 bg-[#050e1c]/80 backdrop-blur-xl z-20">
         <div className="flex items-center gap-4">
            <div onClick={goToHome} className="flex items-center gap-2 cursor-pointer"><ShamaaLogo size="small" /><div className="text-xl font-black gold-gradient-text">{t.logo}</div></div>
         </div>
         <div className="flex items-center gap-6">
            <button onClick={() => setState(prev => ({ ...prev, view: 'create', quiz: null }))} className="px-8 py-3 bg-white text-black font-black rounded-2xl text-sm hover:scale-105 transition-all shadow-xl">{t.create}</button>
            <button onClick={handleLogout} className="text-gray-500 hover:text-rose-500 transition-colors font-bold text-sm">{t.logout}</button>
         </div>
      </header>
      
      <main className="flex-grow p-6 md:p-12 overflow-y-auto">
         {state.view === 'dashboard' && (
           <div className="max-w-7xl mx-auto space-y-12">
             <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black">{t.other_quizzes}</h2>
                <div className="text-gray-500 text-sm font-bold">{state.savedQuizzes.length} {t.other_quizzes}</div>
             </div>
             
             {state.savedQuizzes.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-40 text-center space-y-8 bg-[#0c1425] rounded-[48px] border border-white/5">
                 <div className="w-24 h-24 bg-[#f5ba42]/10 rounded-[32px] flex items-center justify-center text-4xl">📚</div>
                 <div className="space-y-4">
                    <h3 className="text-3xl font-black text-[#f5ba42]">{t.no_projects}</h3>
                    <p className="text-gray-500 font-medium max-w-sm mx-auto">{t.no_projects_desc}</p>
                 </div>
                 <button onClick={() => setState(prev => ({ ...prev, view: 'create' }))} className="px-12 py-5 bg-white text-black font-black rounded-2xl shadow-2xl">{t.create_new}</button>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {state.savedQuizzes.map((q) => (
                    <div key={q.id} onClick={() => setState(prev => ({ ...prev, quiz: q, view: 'quiz' }))} className="bg-[#0c1425] border border-white/5 p-10 rounded-[40px] hover:border-[#f5ba42]/30 transition-all cursor-pointer group shadow-xl">
                       <h3 className="text-2xl font-black mb-4 group-hover:text-[#f5ba42] transition-colors line-clamp-2">{q.title}</h3>
                       <p className="text-gray-500 text-sm font-medium line-clamp-3 mb-8 leading-relaxed">{q.description}</p>
                       <div className="text-[10px] text-gray-600 font-black uppercase tracking-widest">{new Date(q.created_at || '').toLocaleDateString('ar-SA')}</div>
                    </div>
                  ))}
               </div>
             )}
           </div>
         )}

         {state.view === 'create' && (
           <div className="max-w-4xl mx-auto py-10 space-y-10 animate-in slide-in-from-bottom-10">
              <div className="bg-[#0c1425] rounded-[48px] border border-white/5 overflow-hidden shadow-2xl">
                 <div className="flex bg-[#080d1a] border-b border-white/5">
                    {[InputType.TEXT, InputType.URL].map((type) => (
                      <button key={type} onClick={() => setState(prev => ({ ...prev, inputType: type, content: '', error: null }))} className={`flex-1 py-6 text-[11px] font-black tracking-widest uppercase transition-all ${state.inputType === type ? 'text-[#f5ba42] border-b-2 border-[#f5ba42]' : 'text-gray-500 hover:text-gray-300'}`}>{t[type.toLowerCase() as keyof typeof t]}</button>
                    ))}
                 </div>
                 <div className="p-12 space-y-10">
                    <textarea 
                      value={state.content} 
                      onChange={(e) => setState(prev => ({ ...prev, content: e.target.value }))} 
                      placeholder={state.inputType === InputType.TEXT ? t.placeholder_text : t.placeholder_url} 
                      className="w-full h-80 bg-[#040b16] p-10 rounded-[40px] border border-white/5 outline-none focus:ring-2 focus:ring-[#f5ba42]/20 resize-none text-gray-100 text-xl leading-relaxed shadow-inner" 
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                       <div className="space-y-4">
                          <label className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{t.difficulty}</label>
                          <select value={state.difficulty} onChange={(e) => setState(prev => ({...prev, difficulty: e.target.value as Difficulty}))} className="w-full bg-[#040b16] border border-white/5 rounded-2xl p-5 font-black text-sm outline-none">
                             <option value="easy">{t.easy}</option>
                             <option value="medium">{t.medium}</option>
                             <option value="hard">{t.hard}</option>
                          </select>
                       </div>
                       <div className="space-y-4">
                          <label className="text-[10px] uppercase tracking-widest text-gray-500 font-black">{t.question_count}</label>
                          <input type="number" min="1" max="15" value={state.questionCount} onChange={(e) => setState(prev => ({...prev, questionCount: parseInt(e.target.value)}))} className="w-full bg-[#040b16] border border-white/5 rounded-2xl p-5 font-black text-sm outline-none" />
                       </div>
                    </div>
                    {state.error && <div className="p-5 bg-rose-500/10 border border-rose-500/20 rounded-[24px] text-rose-500 text-sm font-bold text-center">{state.error}</div>}
                    <button onClick={startGeneration} disabled={state.isLoading} className="w-full py-7 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] rounded-[32px] font-black text-2xl shadow-2xl hover:scale-[1.02] active:scale-95 transition-all">
                      {state.isLoading ? t.generating : t.generate}
                    </button>
                 </div>
              </div>
           </div>
         )}

         {state.view === 'quiz' && state.quiz && (
           <div className="max-w-5xl mx-auto py-10 space-y-12 animate-in fade-in">
              <div className="bg-[#0c1425] p-16 rounded-[64px] border border-white/5 text-center relative shadow-2xl overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00]"></div>
                <h2 className="text-5xl font-black mb-8 gold-gradient-text leading-tight">{state.quiz.title}</h2>
                <p className="text-gray-400 text-xl font-medium leading-relaxed max-w-3xl mx-auto">{state.quiz.description}</p>
              </div>
              
              <div className="space-y-12">
                {state.quiz.questions.map((q, idx) => (
                  <div key={q.id} className="bg-[#0c1425] p-10 md:p-16 rounded-[56px] border border-white/5 shadow-2xl">
                      <h3 className="text-3xl font-black mb-12 flex gap-6"><span className="w-14 h-14 bg-[#f5ba42]/10 rounded-2xl flex items-center justify-center text-[#f5ba42] text-xl flex-shrink-0">{idx + 1}</span>{q.question}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {q.options.map((opt, oIdx) => (
                          <button 
                            key={oIdx} 
                            onClick={() => !state.showResults && setState(prev => ({...prev, userAnswers: {...prev.userAnswers, [q.id]: oIdx}}))}
                            className={`p-8 rounded-3xl border-2 text-start transition-all font-bold text-lg ${state.userAnswers[q.id] === oIdx ? 'bg-[#f5ba42] text-black border-[#f5ba42]' : 'bg-[#040b16] border-white/5 text-gray-400 hover:border-white/20'}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      {state.showResults && (
                        <div className="mt-12 p-10 bg-emerald-500/5 border border-emerald-500/20 rounded-[40px] animate-in slide-in-from-top-4">
                           <div className="text-[#2ecc71] font-black uppercase text-xs tracking-widest mb-4 flex items-center gap-3">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              {t.explanation}
                           </div>
                           <p className="text-gray-300 text-lg leading-relaxed font-medium">{q.explanation}</p>
                        </div>
                      )}
                  </div>
                ))}
                
                {!state.showResults && (
                  <button onClick={() => { setState(prev => ({...prev, showResults: true})); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="w-full py-8 bg-emerald-500 text-white font-black text-2xl rounded-[40px] shadow-2xl shadow-emerald-500/20 active:scale-95 transition-all">
                    {t.results_btn}
                  </button>
                )}
                
                {state.showResults && (
                  <div className="bg-[#0c1425] p-16 rounded-[64px] border border-white/5 space-y-12 shadow-2xl">
                     <h3 className="text-4xl font-black gold-gradient-text text-center">{t.ai_insights}</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="space-y-6">
                           <h4 className="text-[#f5ba42] font-black uppercase text-xs tracking-widest">{t.gap_analysis}</h4>
                           <p className="text-gray-400 text-lg leading-relaxed font-medium">{state.quiz.gapAnalysis}</p>
                        </div>
                        <div className="space-y-6">
                           <h4 className="text-[#ef6c00] font-black uppercase text-xs tracking-widest">{t.next_steps}</h4>
                           <p className="text-gray-400 text-lg leading-relaxed font-medium">{state.quiz.nextLevelPreview}</p>
                        </div>
                     </div>
                     <button onClick={goToHome} className="w-full py-7 bg-white/5 text-gray-500 font-black rounded-[32px] hover:bg-white/10 transition-colors">{t.home}</button>
                  </div>
                )}
              </div>
           </div>
         )}
      </main>
    </div>
  );

  return (
    <div className="min-h-screen font-tajawal bg-[#050e1c] text-white selection:bg-[#f5ba42]/30 overflow-x-hidden flex flex-col">
       {state.view === 'landing' && renderLanding()}
       {state.view === 'auth' && renderAuth()}
       {state.view === 'payment' && renderPayment()}
       {(state.view === 'dashboard' || state.view === 'create' || state.view === 'quiz') && renderDashboard()}
    </div>
  );
};

export default App;
