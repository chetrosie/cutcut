export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: "3rem",
          fontWeight: 700,
          marginBottom: "1rem",
          color: "#2d3436",
        }}
      >
        CutCut
      </h1>
      <p
        style={{
          fontSize: "1.25rem",
          color: "#6b6b6b",
          marginBottom: "2rem",
        }}
      >
        Modern media processing platform
      </p>
      <div
        style={{
          display: "flex",
          gap: "1rem",
        }}
      >
        <a
          href="https://github.com/chetrosie/cutcut"
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "#2d3436",
            color: "#fff",
            textDecoration: "none",
            borderRadius: "0.5rem",
            fontSize: "1rem",
          }}
        >
          View on GitHub
        </a>
      </div>
    </main>
  );
}
