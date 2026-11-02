import numpy as np, json, wave
T=json.load(open('timing.json',encoding='utf8')); S=T['scenes']; C=T['clips']; END=T['total']
sr=48000; n=int(END*sr)+sr; mus=np.zeros(n); sfx=np.zeros(n)
rng=np.random.default_rng(7)
def add(buf,t,x,g=1.0):
    i=int(t*sr); j=min(n,i+len(x));
    if i<n: buf[i:j]+=g*x[:j-i]
def env(L,a=0.002,d=0.2):
    t=np.arange(L)/sr; return np.minimum(1,t/a)*np.exp(-t/d)
def kick():
    L=int(0.45*sr); t=np.arange(L)/sr; f=50+120*np.exp(-t*30); ph=2*np.pi*np.cumsum(f)/sr
    return np.sin(ph)*np.exp(-t*7)*1.0
def clap():
    L=int(0.25*sr); x=rng.standard_normal(L); t=np.arange(L)/sr
    e=np.exp(-t*25)+0.6*np.exp(-np.maximum(t-0.012,0)*25)*(t>0.012)
    x=np.convolve(x,np.ones(6)/6,'same'); return x*e*0.35
def hat(open_=False):
    L=int((0.18 if open_ else 0.05)*sr); x=rng.standard_normal(L); x=np.diff(np.concatenate([[0],x])); t=np.arange(L)/sr
    return x*np.exp(-t*(18 if open_ else 70))*0.12
def tone(f,dur,kind='saw',d=0.25,g=0.2):
    L=int(dur*sr); t=np.arange(L)/sr
    if kind=='saw': x=2*((t*f)%1)-1
    elif kind=='sq': x=np.sign(np.sin(2*np.pi*f*t))
    else: x=np.sin(2*np.pi*f*t)
    return x*env(L,0.004,d)*g
def lp(x,k=8): return np.convolve(x,np.ones(k)/k,'same')
def nf(m): return 440*2**((m-69)/12)
bpm=126; beat=60/bpm; bar=4*beat
start=S[1]  # الإيقاع يبدأ مع «لا تقلق»
# ---- الخطاف: طنين منخفض + تكتكة ساعة متسارعة + صعود
L=int(start*sr); t=np.arange(L)/sr
drone=(np.sin(2*np.pi*55*t)+0.5*np.sin(2*np.pi*82.5*t))*0.18*np.minimum(1,t/0.4)
add(mus,0,drone)
tt=0.05; gap=0.5
while tt<start-0.3:
    add(sfx,tt,tone(2200,0.03,'sin',0.01,0.25)); tt+=gap; gap=max(0.18,gap*0.9)
Lr=int(1.3*sr); tr=np.arange(Lr)/sr; noise=lp(rng.standard_normal(Lr),3)*(tr/1.3)**2*0.35
sweep=np.sin(2*np.pi*np.cumsum(200+1800*(tr/1.3)**2)/sr)*(tr/1.3)**2*0.12
add(sfx,start-1.3,noise+sweep)
# ---- الإيقاع الرئيسي
chords=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]]  # Am F C G
bass=[45,41,36,43]
tb=start; k=0
while tb<END-0.3:
    bi=(k//4)%4; pos=k%4
    add(mus,tb,kick(),0.9)
    if pos in (1,3): add(mus,tb,clap(),1.0)
    for h in range(2): add(mus,tb+h*beat/2,hat(h==1),1.0)
    add(mus,tb,lp(tone(nf(bass[bi]),beat*0.9,'saw',0.35,0.22),12))
    add(mus,tb+beat/2,lp(tone(nf(bass[bi]+12),beat*0.4,'saw',0.12,0.12),10))
    # ضربات أوتار قصيرة
    if pos in (0,2):
        for m in chords[bi]: add(mus,tb+beat*0.5,lp(tone(nf(m+12),0.18,'sq',0.08,0.045),6))
    # أربيجيو
    for q in range(4):
        m=chords[bi][q%3]+24; add(mus,tb+q*beat/4,tone(nf(m),0.12,'sin',0.07,0.05))
    tb+=beat; k+=1
# ---- مؤثرات: ضربة عند البداية والسعر، وصوت انتقال بين المشاهد، وفرقعة للشارات
def boom():
    L=int(1.2*sr); t=np.arange(L)/sr; f=40+60*np.exp(-t*6)
    return (np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-t*2.5)*0.9+lp(rng.standard_normal(L),20)*np.exp(-t*8)*0.4)
def whoosh(d=0.35):
    L=int(d*sr); t=np.arange(L)/sr; x=lp(rng.standard_normal(L),5); e=np.sin(np.pi*t/d)**2
    return x*e*0.22
def pop():
    L=int(0.12*sr); t=np.arange(L)/sr; f=600+900*np.exp(-t*40)
    return np.sin(2*np.pi*np.cumsum(f)/sr)*np.exp(-t*30)*0.3
add(sfx,S[1],boom(),1.0)
for i in (2,3,4,6): add(sfx,S[i]-0.2,whoosh())
add(sfx,S[5]+0.95,boom(),0.9)
for d in (0.35,1.35,2.4): add(sfx,S[3]+d,pop())
add(sfx,S[3]+(S[4]-S[3])-1.25,boom(),0.6)
add(sfx,S[2]+3.0,pop(),0.8)
add(sfx,S[4]+2.35,pop(),1.0); add(sfx,S[4]+3.7,pop()); add(sfx,S[4]+4.3,pop())
# كاش ريجستر بسيط مع السعر
for i,f in enumerate([1320,1760,2640]): add(sfx,S[5]+1.0+i*0.07,tone(f,0.4,'sin',0.15,0.12))
# ---- تخفيض الموسيقى تحت الصوت
g=np.ones(n)*0.95
for c in C:
    a=int((c['start']-0.1)*sr); b=int((c['end']+0.1)*sr); g[a:b]=0.5
g=np.convolve(g,np.ones(int(0.08*sr))/int(0.08*sr),'same')
fade=np.ones(n); fe=int((END-0.9)*sr); fade[fe:]=np.linspace(1,0,n-fe)
out=(mus*g+sfx)*fade
out=np.tanh(out*0.9)*0.85
w=wave.open('bed.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((out[:int(END*sr)]*32767).astype(np.int16).tobytes()); w.close()
print('bed', END)
