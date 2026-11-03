import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "プライバシーについて | もぐログ" };

const QA: { q: string; a: React.ReactNode }[] = [
  {
    q: "なんでログインが必要なの？",
    a: (
      <>
        自分の記録を自分だけのものにするためです。みんなで同じアプリを使っているので、ログインしないと誰の記録か区別できません。ログインしておけば、スマホを替えても記録は消えず、PCからも同じデータを見られます。
      </>
    ),
  },
  {
    q: "どんな情報を保存しているの？",
    a: (
      <>
        自分で入力したものだけです。
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>メールアドレス（ログイン用）</li>
          <li>身長・体重・年齢・性別・運動量・目的（目標の計算用）</li>
          <li>食事・体重の記録、マイ食品、自作料理</li>
        </ul>
        <p className="mt-2">位置情報・連絡先・写真フォルダなどは取得しません。広告はなく、データを売ったり、ほかの目的に使ったりすることもありません。</p>
      </>
    ),
  },
  {
    q: "ほかの人に自分の記録は見えない？",
    a: (
      <>
        見えません。データベースに「ログインしている本人のデータしか読み書きできない」というルール（Row Level Security）をかけているので、アプリに不具合があっても、ほかの利用者の記録が表示されることはありません。
      </>
    ),
  },
  {
    q: "パスワードは大丈夫？",
    a: (
      <>
        ログインの仕組みは Supabase（世界中で使われている認証サービス）に任せていて、パスワードは元に戻せない形（ハッシュ化）で保存されます。管理者もパスワードを見ることはできません。通信はすべて暗号化（https）されています。
        <p className="mt-2">新しいパスワードを増やしたくない場合は、Googleアカウントでのログインがおすすめです。</p>
      </>
    ),
  },
  {
    q: "成分表示の写真はどこかに送られる？",
    a: <>送られません。写真の文字の読み取りはスマホの中だけで行い、写真はどこにも保存・アップロードしません。</>,
  },
  {
    q: "音声入力の声は保存される？",
    a: (
      <>
        アプリでは保存しません。声を文字にする部分は、スマホやブラウザに最初から入っている音声入力機能（キーボードの音声入力と同じ仕組み）を使っています。ブラウザによっては、文字起こしのために音声が Apple や Google に送られることがあります。気になる場合は、文字で入力してもまったく同じように使えます。
      </>
    ),
  },
  {
    q: "やめたいときは？",
    a: (
      <>
        <b>設定 → アカウントを削除</b> から、いつでも自分のアカウントと全データを完全に削除できます。削除する前に <b>設定 → データを書き出す</b> で記録をCSVファイルとして保存しておくこともできます。
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-lg px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-16">
      <Link href="/" className="text-sm text-brand-600">
        ← もぐログへ
      </Link>
      <h1 className="mt-3 text-2xl font-bold">プライバシーについて</h1>
      <p className="mt-1 text-sm text-gray-500">もぐログで、あなたのデータをどう扱っているかの説明です。</p>

      <div className="mt-6 space-y-3">
        {QA.map(({ q, a }) => (
          <section key={q} className="card">
            <h2 className="font-bold">Q. {q}</h2>
            <div className="mt-2 text-sm leading-relaxed text-gray-700">{a}</div>
          </section>
        ))}
      </div>

      <section className="card mt-6 border-2 border-amber-100">
        <h2 className="font-bold">正直にお伝えしておくこと</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-gray-700">
          <li>
            もぐログは個人が無料で運営しているアプリです。管理者はデータベースの管理画面から、技術的には記録を見られる立場にありますが、
            <b>不具合の対応など必要なとき以外に見ることはありません</b>。
          </li>
          <li>個人運営のため、企業のサービスのような保証はありません。念のため、ほかのサービスと同じパスワードは使わないでください。</li>
          <li>無料プランの仕様で、しばらく誰も使わないとサーバーが一時停止することがあります（データは消えません。管理者が再開します）。</li>
        </ul>
        <p className="mt-3 text-sm text-gray-600">わからないことがあれば、このアプリを紹介してくれた人（管理者）に気軽に聞いてください。</p>
      </section>
    </main>
  );
}
