# NEON//DRIVE — Synthwave Studio

Aplicativo independente para compor instrumentais Synthwave procedurais. Não depende de SoundFont, SpessaSynth, Node.js, Python ou bibliotecas externas para produzir áudio. O Python 3 é utilizado apenas pelo inicializador opcional para servir os arquivos localmente. Esta versão usa a porta 8767 para não reutilizar acidentalmente um servidor antigo em 8765. A reprodução utiliza agendamento incremental com janela de 180 ms, para não criar todas as vozes de uma composição longa de uma só vez.

## Estrutura musical automática

A composição agora é organizada em oito partes, para criar desenvolvimento e reduzir a sensação de loop repetitivo:

1. Introdução
2. Desenvolvimento 1
3. Refrão
4. Desenvolvimento 2
5. Refrão
6. Ponte
7. Refrão final
8. Fade Out + End

É possível escolher três extensões de arranjo: compacta (32 compassos), completa (52 compassos) e estendida (64 compassos). A estrutura completa é selecionada por padrão. Cada parte possui comportamento próprio de instrumentação, densidade, dinâmica, padrão de baixo, arpejador e bateria. O tema melódico do refrão retorna como motivo reconhecível, com pequenas variações nos refrões posteriores.

O Fade Out é aplicado no áudio durante a reprodução e na renderização WAV, por automação de volume do barramento master. Na exportação MIDI, são incluídos marcadores de seção e mensagens CC7/CC11 para automatizar o fade em DAWs compatíveis.

## Recursos

- Três osciladores por voz, com formas de onda Sawtooth, Square, Triangle e Sine.
- Ajustes independentes de mix, oitava e detune dos três osciladores.
- Filtro passa-baixa com ressonância e modulação por LFO.
- Envelope ADSR e portamento.
- Efeitos integrados: chorus estéreo, delay com feedback filtrado, reverb por impulso sintetizado e saturação/drive.
- Arranjo procedural com tonalidade, modo maior/menor, progressões harmônicas, lead, baixo, pad, arpejador e bateria eletrônica.
- Dinâmica de intensidade por seção e retorno temático do refrão.
- Seed reproduzível para gerar novamente a mesma composição.
- Exportação MIDI Type 1 (multifaixa) e WAV estéreo PCM 16-bit / 48 kHz.

## Como iniciar no Windows

1. Extraia a pasta do projeto.
2. Dê duplo clique em `iniciar.bat`.
3. O navegador abrirá `http://127.0.0.1:8767`.
4. Clique em **Generate** para criar a composição. Use **Test Audio** para verificar a saída do sintetizador com uma nota C4; depois clique em **Play Composition** para ouvir o arranjo completo.

## Abrir manualmente

Também é possível abrir `index.html` diretamente no Chrome ou Edge. Para melhor compatibilidade com `AudioContext` e `OfflineAudioContext`, prefira executar pelo servidor local (`iniciar.bat`).

## SoundFont (SF2) é opcional

O sintetizador principal cria o timbre diretamente com três osciladores e efeitos Web Audio. Não há necessidade de carregar ou instalar SF2 para ouvir, gerar ou exportar WAV. O arquivo MIDI pode ser importado em uma DAW e receber, opcionalmente, instrumentos SoundFont externos.

## Formatos exportados

- **WAV:** estéreo, 48.000 Hz, PCM linear de 16 bits, com fade-out de mixagem.
- **MIDI:** Standard MIDI File Type 1, com trilhas separadas para lead, bass, pad, arpeggio, bateria, andamento e compasso; contém marcadores de seção e automação CC7/CC11 para fade-out.

## Estrutura do projeto

```text
synthwave_oscillator_studio/
├── index.html
├── iniciar.bat
├── README.md
├── css/
│   └── style.css
└── js/
    ├── app.js
    ├── audio-engine.js
    ├── midi-export.js
    └── music-generator.js
```

## Compatibilidade

Recomendado: Chrome ou Edge atualizados. O primeiro clique em Play inicia o contexto de áudio por exigência de segurança dos navegadores. Não é necessário acesso à internet para o mecanismo de áudio; fontes externas podem ser substituídas por fontes locais/fallback.
