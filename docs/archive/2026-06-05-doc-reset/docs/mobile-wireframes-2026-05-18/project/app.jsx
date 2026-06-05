// app.jsx — assemble all sections into the design canvas

function App() {
  return (
    <DesignCanvas
      title="AGI Mobile · v1 wireframes"
      subtitle="41 screens · §4 of mobile-screen-design-prompt-2026-05-18"
    >
      {renderSection00()}
      {renderSection01()}
      {renderSectionA()}
      {renderSectionB()}
      {renderSectionC()}
      {renderSectionD()}
      {renderSectionE()}
      {renderSectionF()}
      {renderSectionG()}
      {renderSectionH()}
      {renderSectionI()}
      {renderSectionJ()}
      {renderSectionK()}
      {renderSectionAndroid()}
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
