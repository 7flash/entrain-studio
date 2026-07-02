import './globals.css';

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ENTRAIN Studio</title>
      </head>
      <body>
        <div className="wrap">
          <nav className="nav">
            <a className="brand" href="/">ENTRAIN<b>·studio</b></a>
            <div className="navlinks">
              <a href="/templates">Templates</a>
              <a href="/studio">Studio</a>
              <a href="/library">Library</a>
              <span id="wallet-root" />
            </div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
