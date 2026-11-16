(function (root) {
  'use strict';

  const clamp = (n, lo, hi, fallback) => Number.isFinite(Number(n)) ? Math.max(lo, Math.min(hi, Number(n))) : fallback;

  function impulseBuffer(ctx, seconds, decay) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const fade = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * fade;
      }
    }
    return buffer;
  }

  function distortionCurve(amount) {
    const k = Math.max(0, amount) * 7;
    const n = 2048;
    const curve = new Float32Array(n);
    if (k < 0.001) {
      for (let i = 0; i < n; i++) curve[i] = 2 * i / (n - 1) - 1;
      return curve;
    }
    const norm = Math.tanh(1 + k);
    for (let i = 0; i < n; i++) {
      const x = 2 * i / (n - 1) - 1;
      curve[i] = Math.tanh((1 + k) * x) / norm;
    }
    return curve;
  }

  function buildGraph(ctx, settings) {
    const masterInput = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;
    const master = ctx.createGain();
    master.gain.value = clamp(settings.masterVolume, 0, 100, 78) / 100;
    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(settings.driveOn ? clamp(settings.driveAmount, 0, 75, 12) / 100 : 0);
    shaper.oversample = '2x';
    masterInput.connect(shaper);
    shaper.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);

    // Stereo delay with a filtered feedback loop.
    const delaySend = ctx.createGain();
    const delay = ctx.createDelay(1.2);
    const delayFeedback = ctx.createGain();
    const delayTone = ctx.createBiquadFilter();
    const delayWet = ctx.createGain();
    delay.delayTime.value = clamp(settings.delayTime, 80, 850, 380) / 1000;
    delayFeedback.gain.value = 0.28;
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 4300;
    delayWet.gain.value = settings.delayOn ? clamp(settings.delayMix, 0, 65, 22) / 100 : 0;
    delaySend.gain.value = settings.delayOn ? 0.45 : 0;
    delaySend.connect(delay);
    delay.connect(delayWet);
    delay.connect(delayFeedback);
    delayFeedback.connect(delayTone);
    delayTone.connect(delay);
    delayWet.connect(masterInput);

    // Generated stereo impulse response; no external impulse/sample file is required.
    const reverbSend = ctx.createGain();
    const convolver = ctx.createConvolver();
    const reverbWet = ctx.createGain();
    convolver.buffer = impulseBuffer(ctx, clamp(settings.reverbSize, 0.5, 6, 2.8), 2.8);
    reverbWet.gain.value = settings.reverbOn ? clamp(settings.reverbMix, 0, 65, 20) / 100 : 0;
    reverbSend.gain.value = settings.reverbOn ? 0.32 : 0;
    reverbSend.connect(convolver);
    convolver.connect(reverbWet);
    reverbWet.connect(masterInput);

    // Dual modulated delay lines provide a light stereo chorus.
    const chorusSend = ctx.createGain();
    const chorusWet = ctx.createGain();
    const leftDelay = ctx.createDelay(0.08);
    const rightDelay = ctx.createDelay(0.08);
    const leftPan = ctx.createStereoPanner();
    const rightPan = ctx.createStereoPanner();
    const lfoA = ctx.createOscillator();
    const lfoB = ctx.createOscillator();
    const lfoGainA = ctx.createGain();
    const lfoGainB = ctx.createGain();
    leftDelay.delayTime.value = 0.018;
    rightDelay.delayTime.value = 0.024;
    leftPan.pan.value = -0.72;
    rightPan.pan.value = 0.72;
    const chorusAmount = settings.chorusOn ? clamp(settings.chorusMix, 0, 70, 24) / 100 : 0;
    chorusWet.gain.value = chorusAmount * 0.8;
    chorusSend.gain.value = chorusAmount > 0 ? 0.55 : 0;
    lfoA.frequency.value = 0.22;
    lfoB.frequency.value = 0.27;
    lfoGainA.gain.value = 0.004 * (chorusAmount / 0.24 || 0);
    lfoGainB.gain.value = 0.0045 * (chorusAmount / 0.24 || 0);
    lfoA.connect(lfoGainA); lfoGainA.connect(leftDelay.delayTime);
    lfoB.connect(lfoGainB); lfoGainB.connect(rightDelay.delayTime);
    lfoA.start(); lfoB.start();
    chorusSend.connect(leftDelay); chorusSend.connect(rightDelay);
    leftDelay.connect(leftPan); rightDelay.connect(rightPan);
    leftPan.connect(chorusWet); rightPan.connect(chorusWet);
    chorusWet.connect(masterInput);

    return { masterInput, master, delaySend, reverbSend, chorusSend, lfoA, lfoB, compressor,
      nodes: [masterInput, compressor, master, shaper, delaySend, delay, delayFeedback, delayTone, delayWet, reverbSend, convolver, reverbWet, chorusSend, chorusWet, leftDelay, rightDelay, leftPan, rightPan, lfoA, lfoB, lfoGainA, lfoGainB] };
  }

  function envelope(gainParam, ctx, start, length, settings, kind, noteVelocity) {
    const attack = clamp(settings.attack, 5, 1200, 80) / 1000 * (kind === 'pad' ? 2.2 : kind === 'bass' ? 0.45 : 1);
    const decay = clamp(settings.decay, 30, 1800, 420) / 1000;
    const sustain = clamp(settings.sustain, 0, 100, 64) / 100;
    const release = clamp(settings.release, 50, 3000, 650) / 1000 * (kind === 'pad' ? 1.5 : kind === 'bass' ? 0.55 : 1);
    const velocityScale = Math.pow(clamp(noteVelocity, 1, 127, 88) / 100, 1.25);
    const peak = 0.16 * clamp(velocityScale, 0.025, 1.35, 0.8);
    const end = start + Math.max(0.08, length);
    const attackEnd = Math.min(start + Math.max(0.005, attack), end);
    const decayEnd = Math.min(attackEnd + decay, end);
    let levelAtEnd = peak * sustain;
    if (end <= start + attack) {
      levelAtEnd = peak * Math.max(0.02, (end - start) / Math.max(0.005, attack));
    } else if (end < start + attack + decay) {
      const progress = (end - (start + attack)) / Math.max(0.001, decay);
      levelAtEnd = peak * (1 - (1 - sustain) * progress);
    }
    gainParam.cancelScheduledValues(start);
    gainParam.setValueAtTime(0.0001, start);
    gainParam.linearRampToValueAtTime(peak, attackEnd);
    if (decayEnd > attackEnd) gainParam.linearRampToValueAtTime(peak * sustain, decayEnd);
    gainParam.setValueAtTime(Math.max(0.0001, levelAtEnd), end);
    gainParam.exponentialRampToValueAtTime(0.0001, end + release);
    return { release, end: end + release };
  }

  function addSynthVoice(ctx, event, when, seconds, settings, graph, trackId, voiceRegistry) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = clamp(settings.filterCutoff, 250, 12000, 5200);
    const trackCutoff = trackId === 'bass' ? Math.min(cutoff, 1800) : trackId === 'pad' ? Math.min(cutoff, 3500) : trackId === 'arp' ? Math.min(cutoff * 1.12, 9000) : cutoff;
    filter.frequency.setValueAtTime(trackCutoff, when);
    filter.Q.setValueAtTime(0.5 + clamp(settings.filterResonance, 0, 100, 18) / 18, when);

    const sum = ctx.createGain();
    sum.gain.value = 1;
    const amp = ctx.createGain();
    amp.gain.value = 0.0001;
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(event.pan, -1, 1, 0);
    const mix = [settings.osc1Mix, settings.osc2Mix, settings.osc3Mix].map(v => clamp(v, 0, 100, 0));
    if (mix.reduce((a, b) => a + b, 0) < 0.001) mix[0] = 100;
    const totalMix = Math.max(1, mix.reduce((a, b) => a + b, 0));
    const waves = [settings.osc1Wave, settings.osc2Wave, settings.osc3Wave];
    const octaves = [settings.osc1Oct, settings.osc2Oct, settings.osc3Oct].map(v => clamp(v, -1, 1, 0));
    const tunes = [settings.osc1Tune, settings.osc2Tune, settings.osc3Tune].map(v => clamp(v, -50, 50, 0));
    const oscillators = [];
    const envInfo = envelope(amp.gain, ctx, when, event.durationBeats * seconds, settings, trackId, event.velocity);
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = ['sawtooth', 'square', 'triangle', 'sine'].includes(waves[i]) ? waves[i] : ['sawtooth', 'square', 'triangle'][i];
      const octaveRatio = Math.pow(2, octaves[i]);
      const targetFrequency = 440 * Math.pow(2, (event.pitch - 69) / 12) * octaveRatio;
      const glideTime = clamp(settings.portamento, 0, 250, 0) / 1000;
      if (glideTime > 0.001) {
        osc.frequency.setValueAtTime(targetFrequency * 0.985, when);
        osc.frequency.exponentialRampToValueAtTime(targetFrequency, when + glideTime);
      } else {
        osc.frequency.setValueAtTime(targetFrequency, when);
      }
      osc.detune.setValueAtTime(tunes[i], when);
      oscGain.gain.value = mix[i] / totalMix;
      osc.connect(oscGain); oscGain.connect(sum);
      osc.start(when);
      osc.stop(envInfo.end + 0.04);
      oscillators.push(osc);
    }

    // One low-frequency oscillator per voice adds restrained filter movement.
    if (clamp(settings.lfoRate, 0, 8, 0.35) > 0 && clamp(settings.lfoDepth, 0, 100, 12) > 0) {
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = clamp(settings.lfoRate, 0, 8, 0.35);
      lfoDepth.gain.value = trackCutoff * (clamp(settings.lfoDepth, 0, 100, 12) / 100) * 0.22;
      lfo.connect(lfoDepth); lfoDepth.connect(filter.frequency);
      lfo.start(when); lfo.stop(when + event.durationBeats * seconds + 1.8);
      oscillators.push(lfo);
    }

    sum.connect(filter);
    filter.connect(amp);
    amp.connect(pan);
    pan.connect(graph.masterInput);
    pan.connect(graph.delaySend);
    pan.connect(graph.reverbSend);
    pan.connect(graph.chorusSend);

    const stopNodes = oscillators.slice();
    voiceRegistry.push({ gain: amp.gain, nodes: stopNodes, start: when });
  }

  function makeNoiseBuffer(ctx, seconds) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const raw = Math.random() * 2 - 1;
      last = raw * 0.75 + last * 0.25;
      data[i] = last;
    }
    return buffer;
  }

  function addDrum(ctx, event, when, graph, voiceRegistry) {
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(graph.masterInput);
    out.connect(graph.reverbSend);
    const pitch = event.pitch;
    const sources = [];
    if (pitch === 36) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(135, when);
      osc.frequency.exponentialRampToValueAtTime(43, when + 0.16);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(0.95 * event.velocity / 127, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.34);
      osc.connect(gain); gain.connect(out); osc.start(when); osc.stop(when + 0.38); sources.push(osc);
    } else {
      const isHat = pitch === 42 || pitch === 46;
      const isCrash = pitch === 49;
      const duration = isCrash ? 1.45 : isHat ? (pitch === 46 ? 0.22 : 0.075) : 0.24;
      const source = ctx.createBufferSource();
      source.buffer = makeNoiseBuffer(ctx, duration + 0.03);
      const filter = ctx.createBiquadFilter();
      filter.type = isHat || isCrash ? 'highpass' : 'bandpass';
      filter.frequency.value = isCrash ? 4200 : isHat ? 6200 : 1800;
      filter.Q.value = isHat ? 0.7 : 0.9;
      const gain = ctx.createGain();
      const peak = (isHat ? 0.18 : isCrash ? 0.24 : 0.35) * event.velocity / 127;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(peak, when + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      source.connect(filter); filter.connect(gain); gain.connect(out);
      source.start(when); source.stop(when + duration + 0.04); sources.push(source);
    }
    voiceRegistry.push({ gain: out.gain, nodes: sources, start: when });
  }

  function scheduleComposition(ctx, composition, settings, graph, startAt, voiceRegistry) {
    const beatSeconds = 60 / composition.options.bpm;
    composition.tracks.forEach(track => {
      track.notes.forEach(event => {
        const when = startAt + event.startBeat * beatSeconds;
        if (track.kind === 'drums') addDrum(ctx, event, when, graph, voiceRegistry);
        else addSynthVoice(ctx, event, when, beatSeconds, settings, graph, track.id, voiceRegistry);
      });
    });
  }


  function scheduleArrangementFade(composition, graph, startAt, bpm) {
    if (!composition || !graph || !graph.master || !Number.isFinite(composition.fadeOutStartBeat)) return;
    const beatSeconds = 60 / clamp(bpm, 30, 300, 104);
    const fadeStart = startAt + composition.fadeOutStartBeat * beatSeconds;
    const fadeEnd = startAt + composition.totalBeats * beatSeconds;
    if (fadeEnd <= fadeStart) return;
    const masterGain = graph.master.gain;
    const initialLevel = clamp(masterGain.value, 0, 1.5, 0.78);
    masterGain.cancelScheduledValues(startAt);
    masterGain.setValueAtTime(initialLevel, startAt);
    masterGain.setValueAtTime(initialLevel, fadeStart);
    masterGain.linearRampToValueAtTime(0.0001, fadeEnd);
  }

  function audioSettingsFromControls() {
    const get = id => document.getElementById(id);
    const value = id => get(id)?.value;
    const checked = id => !!get(id)?.checked;
    return {
      masterVolume: value('masterVolume'),
      filterCutoff: value('filterCutoff'), filterResonance: value('filterResonance'),
      attack: value('attackRange'), decay: value('decayRange'), sustain: value('sustainRange'), release: value('releaseRange'),
      lfoRate: value('lfoRate'), lfoDepth: value('lfoDepth'),
      osc1Wave: value('osc1Wave'), osc2Wave: value('osc2Wave'), osc3Wave: value('osc3Wave'),
      osc1Mix: value('osc1Mix'), osc2Mix: value('osc2Mix'), osc3Mix: value('osc3Mix'),
      osc1Oct: value('osc1Oct'), osc2Oct: value('osc2Oct'), osc3Oct: value('osc3Oct'),
      osc1Tune: value('osc1Tune'), osc2Tune: value('osc2Tune'), osc3Tune: value('osc3Tune'),
      chorusOn: checked('chorusOn'), chorusMix: value('chorusMix'),
      delayOn: checked('delayOn'), delayMix: value('delayMix'), delayTime: value('delayTime'),
      reverbOn: checked('reverbOn'), reverbMix: value('reverbMix'), reverbSize: value('reverbSize'),
      driveOn: checked('driveOn'), driveAmount: value('driveAmount')
    };
  }

  function cleanupGraph(graph) {
    if (!graph) return;
    [graph.lfoA, graph.lfoB].forEach(node => { try { node.stop(); } catch (_) { /* Already stopped. */ } });
    (graph.nodes || []).forEach(node => { try { node.disconnect(); } catch (_) { /* Already disconnected. */ } });
  }

  class SynthwaveAudioEngine {
    constructor() {
      this.context = null;
      this.graph = null;
      this.voices = [];
      this.endTimer = null;
      this.startedAt = 0;
      this.expectedDuration = 0;
      this.isPlaying = false;
      this.onEnded = null;
    }

    async ensureContext() {
      if (!this.context || this.context.state === 'closed') {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw new Error('Este navegador não oferece suporte à Web Audio API. Atualize o Chrome ou Edge.');
        this.context = new Ctx({ latencyHint: 'interactive' });
        this.graph = null;
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context;
    }

    async play(composition, onEnded) {
      this.stop();
      const ctx = await this.ensureContext();
      if (this.graph) cleanupGraph(this.graph);
      const settings = audioSettingsFromControls();
      this.graph = buildGraph(ctx, settings);
      const startAt = ctx.currentTime + 0.12;
      scheduleArrangementFade(composition, this.graph, startAt, composition.options.bpm);
      this.startedAt = startAt;
      this.expectedDuration = composition.durationSeconds + 5.2;
      this.onEnded = onEnded || null;
      this.voices = [];
      scheduleComposition(ctx, composition, settings, this.graph, startAt, this.voices);
      this.isPlaying = true;
      this.endTimer = window.setTimeout(() => this.stop(true), this.expectedDuration * 1000);
      return { startAt, duration: this.expectedDuration };
    }

    stop(natural) {
      if (this.endTimer) window.clearTimeout(this.endTimer);
      this.endTimer = null;
      if (this.context && this.isPlaying) {
        const now = this.context.currentTime;
        this.voices.forEach(voice => {
          try {
            voice.gain.cancelScheduledValues(now);
            voice.gain.setTargetAtTime(0.0001, now, natural ? 0.04 : 0.018);
          } catch (_) { /* A finished voice may already be detached. */ }
          voice.nodes.forEach(node => { try { node.stop(now + (natural ? 0.15 : 0.06)); } catch (_) { /* Already stopped. */ } });
        });
      }
      const wasPlaying = this.isPlaying;
      this.isPlaying = false;
      this.voices = [];
      if (this.graph) {
        cleanupGraph(this.graph);
        this.graph = null;
      }
      if (wasPlaying && natural && this.onEnded) {
        const callback = this.onEnded;
        this.onEnded = null;
        window.setTimeout(() => callback(), 80);
      } else if (!natural) {
        this.onEnded = null;
      }
    }

    getPosition() {
      if (!this.context || !this.isPlaying) return 0;
      return Math.max(0, this.context.currentTime - this.startedAt);
    }

    async renderWav(composition, sampleRate, onMessage) {
      const settings = audioSettingsFromControls();
      const totalSeconds = composition.durationSeconds + 6.0;
      const frames = Math.ceil(totalSeconds * sampleRate);
      const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OfflineCtx) throw new Error('OfflineAudioContext não está disponível neste navegador.');
      if (onMessage) onMessage('Preparando motor e efeitos...');
      const offline = new OfflineCtx(2, frames, sampleRate);
      const graph = buildGraph(offline, settings);
      const voices = [];
      scheduleArrangementFade(composition, graph, 0.08, composition.options.bpm);
      scheduleComposition(offline, composition, settings, graph, 0.08, voices);
      if (onMessage) onMessage('Renderizando osciladores, envelopes e efeitos...');
      const buffer = await offline.startRendering();
      let peak = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
      }
      if (peak < 0.00003) throw new Error('O áudio renderizado ficou praticamente silencioso. Confira o mix dos osciladores e as camadas.');
      if (onMessage) onMessage('Convertendo áudio estéreo para WAV PCM...');
      const wav = encodeWav16(buffer, true);
      if (wav.byteLength < 44 + sampleRate) throw new Error('O renderizador produziu um arquivo de áudio vazio.');
      return new Blob([wav], { type: 'audio/wav' });
    }
  }

  function encodeWav16(buffer, normalize) {
    const channels = Math.min(2, buffer.numberOfChannels);
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    const channelData = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch));
    let peak = 0;
    if (normalize) {
      for (let ch = 0; ch < channels; ch++) for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(channelData[ch][i]));
    }
    const gain = normalize && peak > 0.0001 ? Math.min(1.35, 0.89 / peak) : 1;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = length * blockAlign;
    const array = new ArrayBuffer(44 + dataSize);
    const view = new DataView(array);
    const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE');
    write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const sample = Math.max(-1, Math.min(1, channelData[ch][i] * gain));
        view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
        offset += 2;
      }
    }
    return array;
  }

  root.SynthwaveAudioEngine = new SynthwaveAudioEngine();
  root.SynthwaveAudioEngine.encodeWav16 = encodeWav16;
})(window);
