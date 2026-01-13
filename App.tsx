
import React, { useState, useEffect } from 'react';
import { InputType, AppState, Difficulty, QuestionType, ToneStyle, Language, QuizResponse } from './types';
import { generateQuiz } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { translations } from './translations';

const App: React.FC = () => {
  const [state, setState] = useState<AppState & { 
    view: 'landing' | 'dashboard' | 'auth' | 'payment', 
    initialLoading: boolean,
    isPremium: boolean 
  }>({
    inputType: InputType.TEXT,
    difficulty: 'medium',
    subject: 'الفيزياء الحديثة',
    questionTypes: ['mcq', 'true_false'],
    toneStyle: 'academic',
    language: 'ar',
    questionCount: 5,
    content: '',
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
  const t = translations[state.language] || translations['ar'];

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) setUserFromSession(session);
        else setState(prev => ({ ...prev, initialLoading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, initialLoading: false }));
      }
    };
    initAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setUserFromSession(session);
      else setState(prev => ({ ...prev, isLoggedIn: false, user: null, view: 'landing', isPremium: false, initialLoading: false }));
    });
    return () => subscription.unsubscribe();
  }, []);

  const setUserFromSession = (session: any) => {
    const isPremium = session.user.user_metadata?.is_premium === true;
    setState(prev => ({ 
      ...prev, 
      isLoggedIn: true, 
      user: { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.full_name || 'مستخدم شمعة' }, 
      isPremium,
      view: (prev.view === 'landing' || prev.view === 'auth') ? 'dashboard' : prev.view, 
      initialLoading: false 
    }));
    fetchSavedQuizzes(session.user.id);
  };

  const fetchSavedQuizzes = async (userId: string) => {
    const { data } = await supabase.from('quizzes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (data) setState(prev => ({ ...prev, savedQuizzes: data.map(q => ({ id: q.id, ...q.quiz_data, created_at: q.created_at })) }));
  };

  const activatePremium = async () => {
    if (!hasAgreedToTerms) { alert("يرجى الموافقة على الشروط أولاً."); return; }
    setPaymentLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { is_premium: true } });
      if (error) throw error;
      setState(prev => ({ ...prev, isPremium: true, view: 'dashboard' }));
      alert("تم تفعيل حسابك بنجاح! شكراً لثقتك.");
    } catch (err) {
      alert("حدث خطأ أثناء التفعيل.");
    } finally { setPaymentLoading(false); }
  };

  const startGeneration = async () => {
    if (!state.isPremium && state.savedQuizzes.length >= 2) { setState(prev => ({ ...prev, view: 'payment' })); return; }
    if (!state.content.trim()) { setState(prev => ({ ...prev, error: "يرجى إدخال محتوى أولاً" })); return; }
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const quiz = await generateQuiz(state.content, state.inputType, state.difficulty, state.language, state.questionCount);
      if (state.isLoggedIn && state.user) {
        await supabase.from('quizzes').insert([{ user_id: state.user.id, quiz_data: quiz }]);
        fetchSavedQuizzes(state.user.id);
      }
      setState(prev => ({ ...prev, quiz, isLoading: false, showResults: false, userAnswers: {} }));
    } catch (err) {
      setState(prev => ({ ...prev, error: "فشل التوليد", isLoading: false }));
    }
  };

  const Logo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => (
    <div className={`flex items-center gap-2 ${size === "lg" ? "scale-150" : ""}`}>
      <div className="w-10 h-10 gold-gradient rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-white fill-current">
          <path d="M12 2C12 2 7 7 7 12C7 14.7614 9.23858 17 12 17C14.7614 17 17 14.7614 17 12C17 7 12 2 12 2Z" />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className="text-xl font-black tracking-tighter">شمعة AI</span>
        <span className="text-[8px] text-gray-500 font-bold uppercase -mt-1 tracking-widest">SHAM'A QUIZ EDITOR</span>
      </div>
    </div>
  );

  if (state.initialLoading) return (
    <div className="h-screen bg-[#050e1c] flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <Logo size="lg" />
        <div className="text-xs text-gray-500 font-bold tracking-[0.5em]">INITIALIZING V4...</div>
      </div>
    </div>
  );

  const renderLanding = () => (
    <div className="min-h-screen fade-in flex flex-col">
      <nav className="p-8 flex justify-between items-center max-w-7xl mx-auto w-full">
        <Logo />
        <div className="flex gap-4">
          <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'login' }))} className="px-6 py-2 text-sm font-bold text-gray-400">دخول</button>
          <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'signup' }))} className="px-8 py-3 rounded-2xl gold-gradient text-black font-black text-sm">اشترك مجاناً</button>
        </div>
      </nav>
      <main className="flex-grow flex flex-col items-center justify-center text-center p-6 space-y-12">
        <div className="space-y-4">
          <div className="inline-block px-4 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-black tracking-widest uppercase text-gray-400">الجيل القادم من التعلم الذكي</div>
          <h1 className="text-6xl md:text-8xl font-black leading-tight">حوّل المعرفة إلى<br/><span className="gold-text">تحدي حقيقي</span></h1>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg md:text-xl leading-relaxed">منصة "شمعة" هي المحرر الأول الذي يستخدم خوارزميات تربوية لتحليل نصوصك وبناء اختبارات تقيس عمق الفهم.</p>
        </div>
        <button onClick={() => setState(prev => ({ ...prev, view: 'auth', authMode: 'signup' }))} className="px-12 py-5 rounded-3xl gold-gradient text-black font-black text-2xl shadow-2xl shadow-orange-500/30 hover:scale-105 transition-transform">ابدأ رحلتك الآن</button>
      </main>
      <footer className="p-12 text-center text-xs text-gray-600 font-bold tracking-widest uppercase">SHAM'A PLATFORM © 2025 ALL RIGHTS RESERVED</footer>
    </div>
  );

  const renderPayment = () => (
    <div className="min-h-screen flex items-center justify-center p-6 fade-in">
      <div className="max-w-2xl w-full bg-[#0c1425] p-12 rounded-[56px] border border-white/5 shadow-2xl space-y-10 text-center">
        <div className="space-y-4">
          <Logo size="lg" />
          <h2 className="text-4xl font-black">خطوة التفعيل النهائية</h2>
          <p className="text-gray-400">باقة شمعة اللانهائية تمنحك وصولاً كاملاً لجميع ميزات الذكاء الاصطناعي.</p>
        </div>
        <div className="bg-white/5 p-8 rounded-[32px] border border-white/5 space-y-6 text-right">
           <h3 className="font-black text-xl text-[#f5ba42]">طريقة التفعيل:</h3>
           <ul className="space-y-4 text-gray-300 font-bold">
             <li className="flex gap-3"><span className="text-[#f5ba42]">1.</span> اضغط على زر الدفع بالأسفل لإتمام العملية في Whop.</li>
             <li className="flex gap-3"><span className="text-[#f5ba42]">2.</span> بعد الإتمام، عد هنا وأقر بالدفع لتفعيل حسابك فوراً.</li>
           </ul>
        </div>
        <a href="https://whop.com/checkout/plan_egSMCAiLiCtyZ" target="_blank" className="block w-full py-6 rounded-[32px] gold-gradient text-black font-black text-2xl">رابط الدفع في Whop</a>
        <div className="space-y-6">
           <label className="flex items-center justify-center gap-4 cursor-pointer group">
              <input type="checkbox" checked={hasAgreedToTerms} onChange={e => setHasAgreedToTerms(e.target.checked)} className="w-6 h-6 rounded-lg accent-[#f5ba42]" />
              <span className="text-sm font-bold text-gray-400 group-hover:text-white transition-colors">أقر بأني دفعت وأوافق على سياسة الخصوصية والشروط</span>
           </label>
           <button onClick={activatePremium} disabled={!hasAgreedToTerms || paymentLoading} className={`w-full py-5 rounded-2xl font-black text-xl transition-all ${hasAgreedToTerms ? 'bg-white text-black' : 'bg-white/5 text-gray-600 cursor-not-allowed'}`}>
             {paymentLoading ? "جاري التفعيل..." : "تأكيد التفعيل والانطلاق 🚀"}
           </button>
        </div>
        <button onClick={() => setState(prev => ({ ...prev, view: 'dashboard' }))} className="text-gray-500 font-bold text-xs underline underline-offset-8">تخطي مؤقتاً (وصول محدود)</button>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="h-screen flex overflow-hidden fade-in">
      {/* Sidebar - AI Settings */}
      <aside className="w-80 sidebar-blur border-l border-white/5 flex flex-col p-8 space-y-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-3 h-3 gold-gradient rounded-full"></div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">إعدادات الذكاء الاصطناعي</span>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
             <div className="flex justify-between text-[10px] font-black uppercase text-gray-500">
                <span>مستوى الصعوبة</span>
                <span className="text-[#f5ba42]">{state.difficulty === 'easy' ? 'مبتدئ' : state.difficulty === 'medium' ? 'متوسط' : 'خبير'}</span>
             </div>
             <input type="range" min="0" max="2" step="1" value={state.difficulty === 'easy' ? 0 : state.difficulty === 'medium' ? 1 : 2} 
               onChange={(e) => {
                 const v = parseInt(e.target.value);
                 setState(prev => ({...prev, difficulty: v === 0 ? 'easy' : v === 1 ? 'medium' : 'hard'}));
               }} 
               className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer" />
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black uppercase text-gray-500">المادة الدراسية</label>
             <select value={state.subject} onChange={e => setState(prev => ({...prev, subject: e.target.value}))} className="w-full bg-[#0c1425] border border-white/5 rounded-xl p-4 text-sm font-bold outline-none appearance-none">
                <option>الفيزياء الحديثة</option>
                <option>الكيمياء الحيوية</option>
                <option>الأدب العربي</option>
                <option>الرياضيات المتقدمة</option>
             </select>
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black uppercase text-gray-500">أنواع الأسئلة</label>
             <div className="space-y-3">
                {['MCQ', 'True/False', 'Essay'].map((type, i) => (
                   <label key={i} className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-xl cursor-pointer hover:bg-white/[0.05] transition-all">
                      <input type="checkbox" checked={true} readOnly className="w-4 h-4 accent-[#f5ba42]" />
                      <span className="text-xs font-bold text-gray-300">{type === 'MCQ' ? 'اختيار من متعدد' : type === 'True/False' ? 'صح أو خطأ' : 'أسئلة مقالية'}</span>
                   </label>
                ))}
             </div>
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black uppercase text-gray-500">أسلوب الطرح</label>
             <div className="flex bg-[#0c1425] p-1 rounded-xl border border-white/5">
                {['academic', 'simple'].map(t => (
                  <button key={t} onClick={() => setState(prev => ({...prev, toneStyle: t as ToneStyle}))} 
                    className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${state.toneStyle === t ? 'gold-gradient text-black' : 'text-gray-500 hover:text-gray-300'}`}>
                    {t === 'academic' ? 'أكاديمي' : 'مبسط'}
                  </button>
                ))}
             </div>
          </div>
        </div>

        <div className="mt-auto">
           <button onClick={startGeneration} disabled={state.isLoading} className="w-full py-5 gold-gradient rounded-3xl text-black font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-orange-500/20 active:scale-95 transition-all">
              {state.isLoading ? <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div> : <><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>توليد أسئلة جديدة</>}
           </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col relative">
        <header className="h-24 border-b border-white/5 flex items-center justify-between px-12 bg-[#050e1c]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-8 flex-grow max-w-xl">
             <Logo />
             <div className="relative flex-grow">
                <input type="text" placeholder="بحث في الأسئلة..." className="w-full bg-[#0c1425] border border-white/5 rounded-2xl py-3 px-6 text-sm font-bold outline-none focus:ring-1 focus:ring-[#f5ba42]/20" />
                <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
             </div>
          </div>
          <div className="flex items-center gap-6">
             <nav className="flex bg-[#0c1425] p-1 rounded-2xl border border-white/5">
                {['المحرر', 'المكتبة', 'التحليلات'].map((tab, i) => (
                   <button key={i} className={`px-8 py-3 text-xs font-black rounded-xl ${i === 0 ? 'bg-white/5 text-[#f5ba42]' : 'text-gray-500'}`}>{tab}</button>
                ))}
             </nav>
             <button className="px-6 py-3 gold-gradient text-black font-black text-xs rounded-2xl flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM5.884 6.607a1 1 0 011.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 010-1.414zm9.9 0a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0zm-9.9 7.07a1 1 0 011.414 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 010-1.414zm9.9 0a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 11a1 1 0 100-2 1 1 0 000 2z"/></svg>
                تصدير الاختبار
             </button>
             <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 p-1"><div className="w-full h-full bg-orange-500 rounded-xl flex items-center justify-center text-xs font-black">👤</div></div>
          </div>
        </header>

        <main className="flex-grow overflow-y-auto p-12 space-y-12 bg-dashboard-gradient">
           {state.quiz ? (
              <div className="max-w-4xl mx-auto space-y-12">
                 <div className="space-y-2">
                    <div className="text-[10px] font-black text-gray-500 flex items-center gap-2 uppercase tracking-widest">
                       <span>لوحة التحكم</span> <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20"><path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" /></svg> <span>محرر الاختبارات</span>
                    </div>
                    <h2 className="text-5xl font-black text-white">{state.quiz.title}</h2>
                    <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
                       <span className="flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> تم التعديل منذ دقيقتين بواسطة شمعة AI</span>
                    </div>
                 </div>

                 {state.quiz.questions.map((q, idx) => (
                    <div key={idx} className="bg-[#0c1425] p-12 rounded-[56px] border border-white/5 space-y-10 shadow-2xl relative">
                       <div className="absolute top-10 left-10 w-12 h-12 bg-[#f5ba42]/10 rounded-2xl flex items-center justify-center text-[#f5ba42] font-black text-lg">{idx + 1}</div>
                       <h3 className="text-2xl font-black leading-relaxed max-w-2xl">{q.question}</h3>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {q.options.map((opt, oIdx) => (
                             <button key={oIdx} className={`p-6 rounded-[28px] border-2 text-right transition-all font-bold ${oIdx === 0 ? 'border-[#f5ba42] bg-[#f5ba42]/5' : 'border-white/5 bg-white/[0.02] text-gray-400 hover:border-white/20'}`}>
                                <div className="flex items-center gap-4">
                                   <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${oIdx === 0 ? 'border-[#f5ba42]' : 'border-gray-700'}`}>
                                      {oIdx === 0 && <div className="w-2.5 h-2.5 bg-[#f5ba42] rounded-full"></div>}
                                   </div>
                                   {opt}
                                </div>
                             </button>
                          ))}
                       </div>
                       <div className="flex items-center justify-between pt-6 border-t border-white/5 text-[10px] font-black uppercase text-gray-500 tracking-widest">
                          <div className="flex gap-4">
                             <span className="flex items-center gap-2"><svg className="w-3 h-3 text-[#f5ba42]" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" /></svg> صعوبة متوسطة</span>
                             <span className="flex items-center gap-2"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3 1h6v4H5V6zm6 6H5v2h6v-2z" /></svg> {state.subject}</span>
                          </div>
                          <button className="text-[#f5ba42] flex items-center gap-2"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> إعادة توليد السؤال</button>
                       </div>
                    </div>
                 ))}

                 {/* Skeleton Loading Card Example */}
                 <div className="bg-[#0c1425] p-16 rounded-[56px] border border-white/5 shadow-2xl flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                    <div className="w-12 h-12 gold-gradient rounded-2xl flex items-center justify-center animate-bounce">
                       <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 20 20"><path d="M12 2a1 1 0 01.894.553L17.382 11H21a1 1 0 110 2h-4.618l-4.472 8.944a1 1 0 01-1.788 0L5.618 13H1a1 1 0 110-2h4.618l4.472-8.944A1 1 0 0111 2h1z" /></svg>
                    </div>
                    <div className="space-y-2">
                       <h4 className="text-xl font-black">شمعة AI تفكر...</h4>
                       <p className="text-xs text-gray-500 font-bold">يتم توليد السؤال التالي بناءً على معاييرك</p>
                    </div>
                 </div>
              </div>
           ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-center space-y-10 py-32">
                 <div className="w-32 h-32 gold-gradient rounded-[48px] flex items-center justify-center shadow-2xl shadow-orange-500/20"><svg className="w-16 h-16 text-black" fill="currentColor" viewBox="0 0 20 20"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/></svg></div>
                 <div className="space-y-4">
                    <h2 className="text-4xl font-black">جاهز لإضاءة طريقك؟</h2>
                    <p className="text-gray-500 max-w-sm mx-auto font-bold">ألصق النص المراد اختباره في الأسفل وسيقوم الذكاء الاصطناعي بالباقي.</p>
                 </div>
                 <textarea 
                    value={state.content} 
                    onChange={e => setState(prev => ({...prev, content: e.target.value}))}
                    placeholder="ألصق النص هنا..." 
                    className="w-full max-w-2xl h-64 bg-[#0c1425] p-10 rounded-[48px] border border-white/5 outline-none focus:ring-1 focus:ring-[#f5ba42]/20 text-xl leading-relaxed text-gray-300" 
                 />
                 <button onClick={startGeneration} className="px-16 py-6 gold-gradient rounded-[32px] text-black font-black text-2xl">توليد الاختبار الآن</button>
              </div>
           )}
        </main>

        {/* Footer Status Bar */}
        <footer className="h-10 border-t border-white/5 bg-[#050e1c] px-8 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-gray-600">
          <div className="flex gap-6">
             <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> اتصال آمن بالذكاء الاصطناعي</span>
             <span>النموذج: SHAM'A-PRO-V4</span>
          </div>
          <div className="flex gap-4">
             <span className="text-[#f5ba42]">رصيد التوليد المتبقي: 84%</span>
          </div>
        </footer>
      </div>
    </div>
  );

  const renderAuth = () => (
    <div className="min-h-screen flex items-center justify-center p-6 fade-in relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 gold-gradient"></div>
      <div className="max-w-md w-full space-y-12">
        <div className="text-center space-y-4">
           <Logo size="lg" />
           <h2 className="text-4xl font-black gold-text">{state.authMode === 'login' ? 'مرحباً بعودتك' : 'انضم لعالم شمعة'}</h2>
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setState(prev => ({...prev, isLoading: true}));
          try {
            if (state.authMode === 'signup') {
              const { error } = await supabase.auth.signUp({ email: fd.get('email') as string, password: fd.get('password') as string, options: { data: { full_name: fd.get('name') } } });
              if (error) throw error;
              setState(prev => ({ ...prev, view: 'payment', isLoading: false }));
            } else {
              const { error } = await supabase.auth.signInWithPassword({ email: fd.get('email') as string, password: fd.get('password') as string });
              if (error) throw error;
            }
          } catch(err: any) { alert(err.message); setState(prev => ({...prev, isLoading: false})); }
        }} className="bg-[#0c1425] p-10 rounded-[48px] border border-white/5 shadow-2xl space-y-6">
          {state.authMode === 'signup' && <input type="text" name="name" placeholder="الاسم الكامل" required className="w-full bg-white/[0.02] border border-white/5 rounded-2xl p-5 outline-none font-bold focus:ring-1 focus:ring-[#f5ba42]" />}
          <input type="email" name="email" placeholder="البريد الإلكتروني" required className="w-full bg-white/[0.02] border border-white/5 rounded-2xl p-5 outline-none font-bold focus:ring-1 focus:ring-[#f5ba42]" />
          <input type="password" name="password" placeholder="كلمة المرور" required className="w-full bg-white/[0.02] border border-white/5 rounded-2xl p-5 outline-none font-bold focus:ring-1 focus:ring-[#f5ba42]" />
          <button type="submit" disabled={state.isLoading} className="w-full py-5 gold-gradient rounded-2xl text-black font-black text-lg">{state.isLoading ? "جاري المعالجة..." : (state.authMode === 'login' ? 'دخول' : 'إنشاء حساب')}</button>
          <button type="button" onClick={() => setState(prev => ({...prev, authMode: prev.authMode === 'login' ? 'signup' : 'login'}))} className="w-full text-xs font-bold text-gray-500 hover:text-white transition-colors">
            {state.authMode === 'login' ? 'ليس لديك حساب؟ اشترك الآن' : 'لديك حساب بالفعل؟ سجل دخولك'}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050e1c] text-white">
      {state.view === 'landing' && renderLanding()}
      {state.view === 'auth' && renderAuth()}
      {state.view === 'payment' && renderPayment()}
      {state.view === 'dashboard' && renderDashboard()}
    </div>
  );
};

export default App;
