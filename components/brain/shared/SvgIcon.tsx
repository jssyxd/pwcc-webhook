import { CSSProperties } from 'react'

type IconName =
  | 'chat'
  | 'rocket'
  | 'check-circle'
  | 'folder'
  | 'dna'
  | 'book'
  | 'wrench'
  | 'search'
  | 'brain'
  | 'satellite'
  | 'shield'
  | 'robot'
  | 'gemini'
  | 'lightbulb'
  | 'rewind'
  | 'user'
  | 'hourglass'
  | 'refresh'
  | 'x-circle'
  | 'skip'
  | 'warning'
  | 'gear'
  | 'chart'
  | 'star'
  | 'skull'
  | 'shuffle'
  | 'chain'
  | 'pin'
  | 'clipboard'
  | 'calendar'
  | 'pencil'
  | 'trash'
  | 'circle-red'
  | 'circle-green'
  | 'circle-blue'
  | 'circle-purple'
  | 'target'
  | 'microphone'
  | 'document'
  | 'briefcase'
  | 'package'
  | 'ban'
  | 'bolt'
  | 'bug'
  | 'moon'
  | 'lock'
  | 'unlock'

interface SvgIconProps {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
}

interface SvgPathElement {
  type: 'path'
  d: string
  strokeLinecap?: string
  strokeLinejoin?: string
  fill?: string
  stroke?: string
}

interface SvgCircleElement {
  type: 'circle'
  cx: string
  cy: string
  r: string
  fill?: string
  stroke?: string
  strokeLinecap?: string
  strokeLinejoin?: string
}

type SvgElement = SvgPathElement | SvgCircleElement

const icons: Record<IconName, SvgElement[]> = {
  chat: [
    {
      type: 'path',
      d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  rocket: [
    {
      type: 'path',
      d: 'M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  'check-circle': [
    {
      type: 'path',
      d: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  folder: [
    {
      type: 'path',
      d: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  dna: [
    {
      type: 'path',
      d: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  book: [
    {
      type: 'path',
      d: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  wrench: [
    {
      type: 'path',
      d: 'M11.42 15.17l-5.93 5.93a2.1 2.1 0 01-2.96-2.96l5.93-5.93m2.96 2.96L21 7.5c-.91-2.44-3.26-4.18-6-4.18a6.45 6.45 0 00-4.58 1.9',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  search: [
    {
      type: 'path',
      d: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  brain: [
    {
      type: 'path',
      d: 'M12 2C9.5 2 7.5 3.5 7 5.5C5 5.8 3.5 7.5 3.5 9.5c0 1.5.7 2.8 1.8 3.6-.2.5-.3 1-.3 1.6 0 2.2 1.8 4 4 4h.5c.5 1.2 1.7 2 3 2s2.5-.8 3-2h.5c2.2 0 4-1.8 4-4 0-.6-.1-1.1-.3-1.6 1.1-.8 1.8-2.1 1.8-3.6 0-2-1.5-3.7-3.5-4C17.5 3.5 15.5 2 13 2h-1zM12 2v19',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  satellite: [
    {
      type: 'path',
      d: 'M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  shield: [
    {
      type: 'path',
      d: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  robot: [
    {
      type: 'path',
      d: 'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m3.75-1.5v1.5m-7.5 15V21m3.75-1.5V21m3.75-1.5V21M9 6.75h6a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25H9a2.25 2.25 0 01-2.25-2.25v-6A2.25 2.25 0 019 6.75zM9.75 11.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm4.5 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  gemini: [
    {
      type: 'path',
      d: 'M4 4c4 4 4 12 0 16m16-16c-4 4-4 12 0 16M12 2v20',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  lightbulb: [
    {
      type: 'path',
      d: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  rewind: [
    {
      type: 'path',
      d: 'M21 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953l7.108-4.062A1.125 1.125 0 0121 8.688v8.123zM11.25 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953l7.108-4.062a1.125 1.125 0 011.683.977v8.123z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  user: [
    {
      type: 'path',
      d: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  hourglass: [
    {
      type: 'path',
      d: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  refresh: [
    {
      type: 'path',
      d: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  'x-circle': [
    {
      type: 'path',
      d: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  skip: [
    {
      type: 'path',
      d: 'M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  warning: [
    {
      type: 'path',
      d: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  gear: [
    {
      type: 'path',
      d: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    { type: 'path', d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z', strokeLinecap: 'round', strokeLinejoin: 'round' },
  ],
  chart: [
    {
      type: 'path',
      d: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  star: [
    {
      type: 'path',
      d: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  skull: [
    {
      type: 'path',
      d: 'M12 2a8 8 0 00-8 8c0 2.5 1.2 4.7 3 6.1V19a1 1 0 001 1h8a1 1 0 001-1v-2.9c1.8-1.4 3-3.6 3-6.1a8 8 0 00-8-8zm-2 13v2m4-2v2M9 10.5a1 1 0 102 0 1 1 0 00-2 0zm4 0a1 1 0 102 0 1 1 0 00-2 0z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  shuffle: [
    {
      type: 'path',
      d: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  chain: [
    {
      type: 'path',
      d: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  pin: [
    { type: 'path', d: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0z', strokeLinecap: 'round', strokeLinejoin: 'round' },
    {
      type: 'path',
      d: 'M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  clipboard: [
    {
      type: 'path',
      d: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  calendar: [
    {
      type: 'path',
      d: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  pencil: [
    {
      type: 'path',
      d: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  trash: [
    {
      type: 'path',
      d: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  'circle-red': [{ type: 'circle', cx: '12', cy: '12', r: '5', fill: '#ef4444', stroke: 'none' }],
  'circle-green': [{ type: 'circle', cx: '12', cy: '12', r: '5', fill: '#22c55e', stroke: 'none' }],
  'circle-blue': [{ type: 'circle', cx: '12', cy: '12', r: '5', fill: '#3b82f6', stroke: 'none' }],
  'circle-purple': [{ type: 'circle', cx: '12', cy: '12', r: '5', fill: '#a855f7', stroke: 'none' }],
  target: [
    { type: 'circle', cx: '12', cy: '12', r: '9', strokeLinecap: 'round', strokeLinejoin: 'round' },
    { type: 'circle', cx: '12', cy: '12', r: '5', strokeLinecap: 'round', strokeLinejoin: 'round' },
    { type: 'circle', cx: '12', cy: '12', r: '1', fill: 'currentColor', stroke: 'none' },
  ],
  microphone: [
    {
      type: 'path',
      d: 'M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  document: [
    {
      type: 'path',
      d: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  briefcase: [
    {
      type: 'path',
      d: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  package: [
    {
      type: 'path',
      d: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  ban: [
    {
      type: 'path',
      d: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  bolt: [
    {
      type: 'path',
      d: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  bug: [
    {
      type: 'path',
      d: 'M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152-6.135 22.413 22.413 0 00-2.055.487V9a4.5 4.5 0 10-9 0v-.558a22.363 22.363 0 00-2.055-.487A23.91 23.91 0 017.793 14.19 24.193 24.193 0 0112 12.75z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  moon: [
    {
      type: 'path',
      d: 'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  lock: [
    {
      type: 'path',
      d: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
  unlock: [
    {
      type: 'path',
      d: 'M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
}

function renderElement(el: SvgElement, index: number) {
  if (el.type === 'path') {
    return (
      <path
        key={index}
        d={el.d}
        strokeLinecap={el.strokeLinecap as 'round' | 'butt' | 'square' | undefined}
        strokeLinejoin={el.strokeLinejoin as 'round' | 'miter' | 'bevel' | undefined}
        fill={el.fill}
        stroke={el.stroke}
      />
    )
  }
  return (
    <circle
      key={index}
      cx={el.cx}
      cy={el.cy}
      r={el.r}
      fill={el.fill}
      stroke={el.stroke}
      strokeLinecap={el.strokeLinecap as 'round' | 'butt' | 'square' | undefined}
      strokeLinejoin={el.strokeLinejoin as 'round' | 'miter' | 'bevel' | undefined}
    />
  )
}

export default function SvgIcon({ name, size = 20, className = '', style }: SvgIconProps) {
  const elements = icons[name]
  if (!elements) return null

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={`inline-block shrink-0 ${className}`}
      style={style}
      aria-hidden="true"
    >
      {elements.map(renderElement)}
    </svg>
  )
}

export type { IconName }
