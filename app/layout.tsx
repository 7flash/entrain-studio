import { GLOBAL_CSS } from "./global-inline-css";

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>ENTRAIN Studio</title>
        <style data-entrain-global-head>{GLOBAL_CSS}</style>
      </head>
      <body>
        <style data-entrain-global-body>{GLOBAL_CSS}</style>
        <div className="wrap">
          <nav className="nav">
            <a className="brand" href="/">
              ENTRAIN<b>·studio</b>
            </a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
