import React, {useCallback, useEffect, useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Tldraw, toRichText, createShapeId} from 'tldraw'
import 'tldraw/tldraw.css'
import './styles.css'

function App(){
  const editorRef=useRef(null), pcRef=useRef(null), dcRef=useRef(null), audioRef=useRef(null), snapTimer=useRef(null)
  const [status,setStatus]=useState('Ready')
  const [connected,setConnected]=useState(false)
  const [lastHeard,setLastHeard]=useState('')
  const [lastSaid,setLastSaid]=useState('')
  const [autoVision,setAutoVision]=useState(true)

  const sendEvent=useCallback((event)=>{ if(dcRef.current?.readyState==='open') dcRef.current.send(JSON.stringify(event)) },[])

  const snapshot=useCallback(async()=>{
    const ed=editorRef.current; if(!ed) return
    try{
      const shapes=ed.getCurrentPageShapes()
      if(!shapes.length) return
      const {url}=await ed.toImageDataUrl(shapes,{format:'jpeg',quality:0.65,pixelRatio:1,background:true,padding:16})
      sendEvent({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_image',image_url:url,detail:'low'},{type:'input_text',text:'This is the current whiteboard state. Use it as visual context for the next tutoring turn; do not respond solely because the board changed.'}]}})
    }catch(e){console.error('snapshot',e)}
  },[sendEvent])

  const handleTool=useCallback((name,args,callId)=>{
    const ed=editorRef.current; if(!ed) return
    try{
      if(name==='add_text') ed.createShape({id:createShapeId(),type:'text',x:args.x,y:args.y,props:{richText:toRichText(args.text),fontSize:args.fontSize||24}})
      if(name==='add_box'){
        ed.createShape({id:createShapeId(),type:'geo',x:args.x,y:args.y,props:{geo:'rectangle',w:args.w,h:args.h,fill:'none',color:'blue',dash:'solid'}})
        if(args.label) ed.createShape({id:createShapeId(),type:'text',x:args.x+12,y:args.y+12,props:{richText:toRichText(args.label),fontSize:20}})
      }
      if(name==='add_arrow') ed.createShape({id:createShapeId(),type:'arrow',x:args.x1,y:args.y1,props:{start:{x:0,y:0},end:{x:args.x2-args.x1,y:args.y2-args.y1},arrowheadEnd:'arrow',color:'blue'}})
      if(name==='clear_board') ed.deleteShapes(ed.getCurrentPageShapes())
      sendEvent({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify({ok:true})}})
      sendEvent({type:'response.create'})
    }catch(e){sendEvent({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify({ok:false,error:String(e)})}});sendEvent({type:'response.create'})}
  },[sendEvent])

  const connect=useCallback(async()=>{
    if(connected) return
    setStatus('Requesting microphone…')
    const stream=await navigator.mediaDevices.getUserMedia({audio:true})
    const pc=new RTCPeerConnection(); pcRef.current=pc
    stream.getTracks().forEach(t=>pc.addTrack(t,stream))
    const audio=document.createElement('audio'); audio.autoplay=true; audioRef.current=audio
    pc.ontrack=e=>{audio.srcObject=e.streams[0]}
    const dc=pc.createDataChannel('oai-events'); dcRef.current=dc
    dc.onopen=()=>{setConnected(true);setStatus('Live — draw or talk')}
    dc.onclose=()=>{setConnected(false);setStatus('Disconnected')}
    dc.onmessage=async e=>{
      const ev=JSON.parse(e.data)
      if(ev.type==='response.output_audio_transcript.done') setLastSaid(ev.transcript||'')
      if(ev.type==='conversation.item.input_audio_transcription.completed') setLastHeard(ev.transcript||'')
      if(ev.type==='response.function_call_arguments.done'){
        let args={}; try{args=JSON.parse(ev.arguments||'{}')}catch{}
        handleTool(ev.name,args,ev.call_id)
      }
      if(ev.type==='error') console.error(ev)
    }
    const offer=await pc.createOffer(); await pc.setLocalDescription(offer)
    const r=await fetch('/api/realtime',{method:'POST',headers:{'Content-Type':'application/sdp'},body:offer.sdp})
    if(!r.ok) throw new Error(await r.text())
    await pc.setRemoteDescription({type:'answer',sdp:await r.text()})
    setStatus('Connecting…')
    setTimeout(()=>snapshot(),1200)
  },[connected,handleTool,snapshot])

  const disconnect=()=>{dcRef.current?.close();pcRef.current?.close();setConnected(false);setStatus('Ready')}

  useEffect(()=>{
    const ed=editorRef.current; if(!ed || !connected || !autoVision) return
    const unsub=ed.store.listen(()=>{
      clearTimeout(snapTimer.current)
      snapTimer.current=setTimeout(()=>snapshot(),1800)
    })
    return ()=>unsub()
  },[connected,autoVision,snapshot])

  return <div className="app">
    <div className="topbar"><div><strong>AI Whiteboard Tutor</strong><span className="sub">voice + shared canvas + vision</span></div><div className="controls"><span className={connected?'live dot':'dot'}></span><span>{status}</span><button onClick={connected?disconnect:connect}>{connected?'End session':'Start tutor'}</button><label><input type="checkbox" checked={autoVision} onChange={e=>setAutoVision(e.target.checked)}/> live vision</label></div></div>
    <div className="board"><Tldraw onMount={ed=>{editorRef.current=ed; ed.createShape({id:createShapeId(),type:'text',x:120,y:100,props:{richText:toRichText('Welcome. Draw your thinking here.'),fontSize:28}})}} /></div>
    <aside className="hud"><div><b>Student said</b><p>{lastHeard||'—'}</p></div><div><b>Tutor said</b><p>{lastSaid||'—'}</p></div><small>The tutor sees the board as an image after changes and can add labels, boxes, arrows, or clear it when asked.</small></aside>
  </div>
}
createRoot(document.getElementById('root')).render(<App/>)
