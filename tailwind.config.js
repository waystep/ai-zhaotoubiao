/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			// Notion Primary - 直接使用十六进制
  			primary: {
  				DEFAULT: '#5645d4',
  				foreground: '#ffffff'
  			},
  			// Notion Secondary
  			secondary: {
  				DEFAULT: '#f6f5f4',
  				foreground: '#1a1a1a'
  			},
  			// Destructive/Error
  			destructive: {
  				DEFAULT: '#e03131',
  				foreground: '#ffffff'
  			},
  			// Muted
  			muted: {
  				DEFAULT: '#f6f5f4',
  				foreground: '#787671'
  			},
  			// Accent
  			accent: {
  				DEFAULT: '#f6f5f4',
  				foreground: '#1a1a1a'
  			},
  			// Background & Foreground
  			background: '#ffffff',
  			foreground: '#1a1a1a',
  			// Border & Input
  			border: '#e5e3df',
  			input: '#c8c4be',
  			ring: '#5645d4',
  			// Card
  			card: {
  				DEFAULT: '#ffffff',
  				foreground: '#1a1a1a'
  			},
  			// Popover
  			popover: {
  				DEFAULT: '#ffffff',
  				foreground: '#1a1a1a'
  			},
  			// Notion Brand Colors
  			'brand-navy': '#0a1530',
  			'brand-navy-deep': '#070f24',
  			'link-blue': '#0075de',
  			// Notion Ink Scale
  			ink: '#1a1a1a',
  			charcoal: '#37352f',
  			slate: '#5d5b54',
  			steel: '#787671',
  			stone: '#a4a097',
  			// Notion Card Tints
  			'tint-peach': '#ffe8d4',
  			'tint-rose': '#fde0ec',
  			'tint-mint': '#d9f3e1',
  			'tint-lavender': '#e6e0f5',
  			'tint-sky': '#dcecfa',
  			'tint-yellow': '#fef7d6',
  			'tint-yellow-bold': '#f9e79f',
  		},
  		// Notion Typography 规范
  		fontSize: {
  			// Display sizes
  			'hero': ['80px', { lineHeight: '1.05', letterSpacing: '-2px', fontWeight: '600' }],
  			'display-lg': ['56px', { lineHeight: '1.10', letterSpacing: '-1px', fontWeight: '600' }],
  			// Heading sizes (覆盖 Tailwind 默认)
  			'h1': ['48px', { lineHeight: '1.15', letterSpacing: '-0.5px', fontWeight: '600' }],
  			'h2': ['36px', { lineHeight: '1.20', letterSpacing: '-0.5px', fontWeight: '600' }],
  			'h3': ['28px', { lineHeight: '1.25', fontWeight: '600' }],
  			'h4': ['22px', { lineHeight: '1.30', fontWeight: '600' }],
  			'h5': ['18px', { lineHeight: '1.40', fontWeight: '600' }],
  			// Body sizes
  			'subtitle': ['18px', { lineHeight: '1.50', fontWeight: '400' }],
  			'body': ['16px', { lineHeight: '1.55', fontWeight: '400' }],
  			'body-sm': ['14px', { lineHeight: '1.50', fontWeight: '400' }],
  			'caption': ['13px', { lineHeight: '1.40', fontWeight: '400' }],
  			'micro': ['12px', { lineHeight: '1.40', fontWeight: '500' }],
  			'micro-uppercase': ['11px', { lineHeight: '1.40', letterSpacing: '1px', fontWeight: '600' }],
  			'button': ['14px', { lineHeight: '1.30', fontWeight: '500' }],
  			// 统计数字专用
  			'stat': ['28px', { lineHeight: '1.25', fontWeight: '600' }],
  		},
  		borderRadius: {
  			lg: '0.75rem',
  			md: '0.5rem',
  			sm: '0.375rem'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
