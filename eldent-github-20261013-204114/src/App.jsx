import buttonTheme from './button-theme.css?inline';

export function App() {
  function applyButtonTheme(event) {
    const document = event.currentTarget.contentDocument;
    if (!document) return;
    const style = document.createElement('style');
    style.textContent = buttonTheme;
    document.head.appendChild(style);
  }
  return <iframe onLoad={applyButtonTheme} title="ЭлДент — главная страница" src="/preview/index.html" style={{ width: '100%', height: '100dvh', border: 0, display: 'block' }} />;
}
