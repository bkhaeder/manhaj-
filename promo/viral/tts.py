import json,sys,base64,urllib.request,wave,os
K=os.environ['K']; model=sys.argv[1]; voice=sys.argv[2]; idx=[int(x) for x in sys.argv[3].split(',')]; out=sys.argv[4]
lines=json.load(open('lines.json',encoding='utf8'))
style='اقرأ بالعربية الفصحى السليمة بصوت شاب حماسي واثق وسريع الإيقاع كإعلان قصير على تيك توك، مع نطق صحيح للتشكيل: '
for i in idx:
    body={"contents":[{"parts":[{"text":style+lines[i]}]}],"generationConfig":{"responseModalities":["AUDIO"],"speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":voice}}}}}
    req=urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",data=json.dumps(body).encode(),headers={"x-goog-api-key":K,"Content-Type":"application/json"})
    import time
    for a in range(4):
        try: d=json.load(urllib.request.urlopen(req,timeout=180)); break
        except Exception as e: print('retry',i,e); time.sleep(5)
    pcm=base64.b64decode(d['candidates'][0]['content']['parts'][0]['inlineData']['data'])
    w=wave.open(f"{out}/v{i}.wav","wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm); w.close()
    print(i, round(len(pcm)/48000,2),'s')
