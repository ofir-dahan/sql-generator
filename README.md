# SSMS Query Generator

A powerful React Next.js application for generating SQL Server Management Studio (SSMS) queries from JSON, CSV, and TSV data.

## 🚀 Features

- **Multi-Format Support**: Upload JSON, CSV, or TSV files, or paste data manually
- **Smart Placeholder System**: 
  - Single `{key}` creates individual rows for each record
  - Double `{{key}}` creates comma-separated values for batch operations
- **Interactive Template Building**: Ctrl/Cmd+click placeholders for smart insertion
- **Batch Management**: Configurable batch sizes with automatic tab generation
- **Template History**: Save and reuse your SQL templates
- **Performance Optimized**: Debounced input and memoized components
- **Syntax Highlighting**: Beautiful SQL syntax highlighting with VS Code theme

## 🛠️ Technologies

- **Frontend**: Next.js 15.4.6, React 19, TypeScript
- **Styling**: Tailwind CSS
- **File Upload**: React Dropzone with drag-and-drop
- **Syntax Highlighting**: React Syntax Highlighter
- **State Management**: React Hooks with localStorage persistence

## 📦 Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
