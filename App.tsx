
import React, { useState, useEffect } from 'react';
import { InputType, AppState, Difficulty, QuizMode, Language, User, Question, QuizResponse } from './types';
import { generateQuiz } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { translations } from './translations';

const App: React.FC = () => {
  const [state, setState] = useState<AppState & { 
    view: 'landing' | 'dashboard' | 'create' | 'quiz' | 'settings' | 'auth' | 'payment', 
    initialLoading: boolean,
    isPremium: boolean 
  }>({
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
    authMode: 'login',
    isPremium: false
  });

  const [hasAgreedToTerms, setHasAgreedToTerms] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  
  const currentLang = translations[state.language] || translations['ar'];
  const t = currentLang;

  // Initialize Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
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
        setState(prev => ({ 
          ...prev, 
          isLoggedIn: false, 
          user: null, 
          view: 'landing', 
          isPremium: false, 
          initialLoading: false 
        }));
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
    
    // Check premium status from metadata
    const isPremium = session.user.user_metadata?.is_premium === true;
    
    setState(prev => ({ 
      ...prev, 
      isLoggedIn: true, 
      user, 
      isPremium,
      view: (prev.view === 'landing' || prev.view === 'auth') ? 'dashboard' : prev.view, 
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

  const activatePremium = async () => {
    if (!hasAgreedToTerms) {
      setActivationError("يجب الموافقة على الإقرار أولاً قبل التفعيل.");
      return;
    }

    setPaymentLoading(true);
    setActivationError(null);

    try {
      // Update metadata in Supabase
      const { data, error } = await supabase.auth.updateUser({
        data: { is_premium: true }
      });

      if (error) throw error;

      if (data?.user) {
        setState(prev => ({ 
          ...prev, 
          isPremium: true, 
          view: 'dashboard',
          error: null 
        }));
        alert("تم تفعيل حسابك بنجاح! شكراً لانضمامك لبريميوم شمعة.");
      }
    } catch (err: any) {
      console.error("Premium activation failed:", err);
      setActivationError("حدث خطأ أثناء تفعيل الحساب. يرجى التأكد من اتصالك بالإنترنت أو المحاولة لاحقاً.");
    } finally {
      setPaymentLoading(false);
    }
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
    if (!state.isPremium && state.savedQuizzes.length >= 2) {
      setState(prev => ({ ...prev, view: 'payment', error: "لقد وصلت للحد الأقصى من الاختبارات المجانية. اشترك الآن للاستمرار." }));
      return;
    }

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
          .insert([{ user_id: state.user.id, quiz_data: quiz }])
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
        error: err.message || "فشل في إنشاء الاختبار. يرجى المحاولة مرة أخرى.", 
        isLoading: false 
      }));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const goToHome = () => {
    if (state.isLoggedIn) {
      setState(prev => ({ ...prev, view: 'dashboard', quiz: null, error: null }));
    } else {
      setState(prev => ({ ...prev, view: 'landing', error: null }));
    }
  };

  const ShamaaLogo = ({ size = "medium" }: { size?: "small" | "medium" | "large" }) => {
    const dimensions = size === "small" ? "w-10 h-10" : size === "large" ? "w-32 h-32" : "w-16 h-16";
    return (
      <div className={`${dimensions} shamaa-logo-container relative flex items-center justify-center transition-transform hover:scale-110 duration-500`}>
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
        <div className="mt-8 animate-pulse text-[#f5ba42] font-black text-xl tracking-widest uppercase">شمعة - جاري التحميل...</div>
      </div>
    );
  }

  // --- Views ---

  const renderLanding = () => (
    <div className="w-full flex flex-col animate-in fade-in duration-1000">
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
        <div className="max-w-4xl mx-auto space-y-10 relative z-10">
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

      <footer className="py-20 text-center text-gray-600 font-medium border-t border-white/5 bg-[#040b16]">
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
          <button type="submit" disabled={state.isLoading} className="w-full py-5 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] text-white font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl">
            {state.isLoading ? 'جاري التحميل...' : (state.authMode === 'login' ? t.login : t.signup)}
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
    <div className="min-h-screen bg-[#040b16] flex flex-col items-center justify-center py-12 px-6 relative overflow-y-auto animate-in fade-in">
      <div className="absolute inset-0 bg-dashboard-gradient opacity-30 pointer-events-none"></div>
      <div className="max-w-2xl w-full z-10 space-y-12 text-center">
        <div className="space-y-4">
           <div onClick={goToHome} className="flex justify-center mb-8 cursor-pointer hover:scale-105 transition-transform"><ShamaaLogo size="large" /></div>
           <h1 className="text-4xl md:text-6xl font-black gold-gradient-text">خطوة التميز الأخيرة</h1>
           <p className="text-gray-400 text-lg md:text-xl font-medium max-w-xl mx-auto">{t.payment_desc}</p>
        </div>

        <div className="bg-[#0c1425] border border-white/5 p-10 md:p-16 rounded-[48px] shadow-[0_40px_100px_rgba(0,0,0,0.6)] space-y-10">
           <div className="space-y-6">
              <h3 className="text-2xl font-black text-white">كيفية تفعيل الاشتراك:</h3>
              <div className="grid grid-cols-1 gap-4 text-start">
                 <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="w-8 h-8 bg-[#f5ba42] text-black font-black rounded-full flex items-center justify-center text-sm">1</span>
                    <span className="text-gray-300 font-bold">أكمل عملية الدفع الآمنة عبر رابط Whop بالأسفل.</span>
                 </div>
                 <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="w-8 h-8 bg-[#f5ba42] text-black font-black rounded-full flex items-center justify-center text-sm">2</span>
                    <span className="text-gray-300 font-bold">بعد الإتمام، اضغط على زر "تأكيد التفعيل" في هذه الصفحة.</span>
                 </div>
              </div>
           </div>

           <a 
              href="https://whop.com/checkout/plan_egSMCAiLiCtyZ" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block w-full py-6 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00] text-white font-black text-2xl rounded-[32px] shadow-[0_20px_60px_rgba(239,108,0,0.4)] hover:scale-[1.05] active:scale-95 transition-all text-center"
           >
              إتمام الدفع عبر Whop
           </a>

           <div className="h-px bg-white/10 w-full"></div>

           <div className="space-y-6">
              <label className="flex items-center justify-center gap-4 cursor-pointer group">
                 <input 
                    type="checkbox" 
                    checked={hasAgreedToTerms} 
                    onChange={(e) => {
                      setHasAgreedToTerms(e.target.checked);
                      setActivationError(null);
                    }}
                    className="w-6 h-6 rounded-lg accent-[#f5ba42] bg-[#040b16] border-white/10 cursor-pointer"
                 />
                 <span className="text-gray-400 font-bold text-sm group-hover:text-white transition-colors">
                    أقر بأني دفعت وأوافق على <span className="underline">سياسة الخصوصية والشروط والأحكام</span>
                 </span>
              </label>

              <button 
                 onClick={activatePremium} 
                 disabled={!hasAgreedToTerms || paymentLoading}
                 className={`w-full py-5 rounded-2xl font-black text-xl transition-all shadow-xl flex items-center justify-center gap-3 ${hasAgreedToTerms ? 'bg-white text-black hover:bg-gray-100' : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5'}`}
              >
                 {paymentLoading ? (
                   <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                 ) : "تأكيد التفعيل والانطلاق"}
              </button>
           </div>
        </div>

        {activationError && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-sm font-bold animate-bounce">
            {activationError}
          </div>
        )}

        <button onClick={goToHome} className="text-gray-500 hover:text-white font-bold underline underline-offset-8 transition-colors">{t.skip_payment}</button>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="flex-grow flex flex-col min-h-screen animate-in fade-in">
      <header className="h-24 flex items-center justify-between px-6 md:px-12 border-b border-white/5 bg-[#050e1c]/80 backdrop-blur-xl z-20">
         <div className="flex items-center gap-4">
            <div onClick={goToHome} className="flex items-center gap-2 cursor-pointer"><ShamaaLogo size="small" /><div className="text-xl font-black gold-gradient-text">{t.logo}</div></div>
            {state.isPremium && (
              <span className="px-3 py-1 bg-[#f5ba42] text-black text-[10px] font-black rounded-full uppercase tracking-widest hidden sm:inline-block">PREMIUM</span>
            )}
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
                <div className="text-gray-500 text-sm font-bold">{state.savedQuizzes.length} اختبار</div>
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
                      {state.isLoading ? "جاري التحليل التربوي..." : t.generate}
                    </button>
                 </div>
              </div>
           </div>
         )}

         {state.view === 'quiz' && state.quiz && (
           <div className="max-w-5xl mx-auto py-10 space-y-12">
              <div className="bg-[#0c1425] p-16 rounded-[64px] border border-white/5 text-center relative shadow-2xl overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#f5ba42] to-[#ef6c00]"></div>
                <h2 className="text-5xl font-black mb-8 gold-gradient-text leading-tight">{state.quiz.title}</h2>
                <p className="text-gray-400 text-xl font-medium leading-relaxed max-w-3xl mx-auto">{state.quiz.description}</p>
              </div>
              
              <div className="space-y-12 pb-32">
                {state.quiz.questions.map((q, idx) => (
                  <div key={idx} className="bg-[#0c1425] p-10 md:p-16 rounded-[56px] border border-white/5 shadow-2xl">
                      <h3 className="text-3xl font-black mb-12 flex gap-6"><span className="w-14 h-14 bg-[#f5ba42]/10 rounded-2xl flex items-center justify-center text-[#f5ba42] text-xl flex-shrink-0">{idx + 1}</span>{q.question}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {q.options.map((opt, oIdx) => (
                          <button 
                            key={oIdx} 
                            onClick={() => !state.showResults && setState(prev => ({...prev, userAnswers: {...prev.userAnswers, [idx]: oIdx}}))}
                            className={`p-8 rounded-3xl border-2 text-start transition-all font-bold text-lg ${state.userAnswers[idx] === oIdx ? 'bg-[#f5ba42] text-black border-[#f5ba42]' : 'bg-[#040b16] border-white/5 text-gray-400 hover:border-white/20'}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      {state.showResults && (
                        <div className="mt-12 p-10 bg-emerald-500/5 border border-emerald-500/20 rounded-[40px] animate-in slide-in-from-top-4">
                           <div className="text-[#2ecc71] font-black uppercase text-xs tracking-widest mb-4 flex items-center gap-3">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              التحليل التربوي للإجابة:
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
                     <h3 className="text-4xl font-black gold-gradient-text text-center">نتائج التحليل الذكي</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="space-y-6">
                           <h4 className="text-[#f5ba42] font-black uppercase text-xs tracking-widest">فجوات الفهم المتوقعة:</h4>
                           <p className="text-gray-400 text-lg leading-relaxed font-medium">{state.quiz.gapAnalysis}</p>
                        </div>
                        <div className="space-y-6">
                           <h4 className="text-[#ef6c00] font-black uppercase text-xs tracking-widest">خطوتك القادمة:</h4>
                           <p className="text-gray-400 text-lg leading-relaxed font-medium">{state.quiz.nextLevelPreview}</p>
                        </div>
                     </div>
                     <button onClick={goToHome} className="w-full py-7 bg-white/5 text-gray-500 font-black rounded-[32px] hover:bg-white/10 transition-colors">العودة للرئيسية</button>
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
