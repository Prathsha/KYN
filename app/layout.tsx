import type {Metadata,Viewport} from 'next';import './globals.css';import {Install} from '@/components/install';
export const metadata:Metadata={title:'KYN — A little company, wherever you’re headed',description:'Walking and subway companionship in New York. Your neighborhood, together.',applicationName:'KYN',appleWebApp:{capable:true,statusBarStyle:'default',title:'KYN'},icons:{icon:'/icons/icon-192.png',apple:'/icons/apple-touch-icon.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#C9D5C9'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<Install/></body></html>}
