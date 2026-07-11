import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import NisaLifePlan from "./App.jsx";
import BlogList from "./BlogList.jsx";
import BlogPost from "./BlogPost.jsx";

// シンプルなページ切り替え（ルーティングライブラリを増やさずに実装）
// view.page: "app" | "blogList" | "blogPost"
function Root() {
  const [view, setView] = useState({ page: "app" });

  // ブログ記事の「無料シミュレーションを始める」ボタンから戻ってきた時、
  // トップページの入力フォーム（#simulator）まで自動スクロールする
  useEffect(() => {
    if (view.page === "app" && view.scrollToSimulator) {
      const t = setTimeout(() => {
        document.getElementById("simulator")?.scrollIntoView({ behavior: "smooth" });
      }, 60);
      return () => clearTimeout(t);
    }
  }, [view]);

  const goToSimulator = () => setView({ page: "app", scrollToSimulator: true });

  if (view.page === "blogList") {
    return (
      <BlogList
        onBack={() => setView({ page: "app" })}
        onSelectPost={(slug) => setView({ page: "blogPost", slug })}
      />
    );
  }

  if (view.page === "blogPost") {
    return (
      <BlogPost
        slug={view.slug}
        onBack={() => setView({ page: "blogList" })}
        onGoToSimulator={goToSimulator}
      />
    );
  }

  return <NisaLifePlan onOpenBlog={() => setView({ page: "blogList" })} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
