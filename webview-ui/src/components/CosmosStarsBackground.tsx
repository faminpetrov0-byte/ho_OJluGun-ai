import React, { useEffect, useRef } from "react"

/**
 * Cosmos AI Stars Background Component
 * Добавляет космический фон со звездами для улучшения UX
 */
export const CosmosStarsBackground: React.FC = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) {
			return
		}

		const ctx = canvas.getContext("2d")
		if (!ctx) {
			return
		}

		// Настройка размера canvas
		const resizeCanvas = () => {
			canvas.width = window.innerWidth
			canvas.height = window.innerHeight
		}

		resizeCanvas()
		window.addEventListener("resize", resizeCanvas)

		// Звезды
		const stars: Array<{
			x: number
			y: number
			size: number
			opacity: number
			twinkleSpeed: number
			twinklePhase: number
		}> = []

		// Создание звезд
		const createStars = () => {
			const starCount = Math.floor((canvas.width * canvas.height) / 8000) // Адаптивное количество

			for (let i = 0; i < starCount; i++) {
				stars.push({
					x: Math.random() * canvas.width,
					y: Math.random() * canvas.height,
					size: Math.random() * 2 + 0.5,
					opacity: Math.random() * 0.8 + 0.2,
					twinkleSpeed: Math.random() * 0.02 + 0.005,
					twinklePhase: Math.random() * Math.PI * 2,
				})
			}
		}

		createStars()

		// Анимация
		let animationId: number
		let time = 0

		const animate = () => {
			time += 0.016 // ~60fps

			// Очистка canvas
			ctx.fillStyle = "rgba(0, 0, 0, 0.05)"
			ctx.fillRect(0, 0, canvas.width, canvas.height)

			// Рисование звезд
			stars.forEach((star) => {
				// Мерцание
				const twinkle = Math.sin(time * star.twinkleSpeed + star.twinklePhase) * 0.3 + 0.7
				const currentOpacity = star.opacity * twinkle

				// Градиент для звезды
				const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 2)
				gradient.addColorStop(0, `rgba(255, 255, 255, ${currentOpacity})`)
				gradient.addColorStop(0.5, `rgba(138, 43, 226, ${currentOpacity * 0.5})`)
				gradient.addColorStop(1, "rgba(255, 255, 255, 0)")

				ctx.fillStyle = gradient
				ctx.beginPath()
				ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
				ctx.fill()

				// Медленное движение
				star.x += Math.sin(time * 0.001 + star.twinklePhase) * 0.1
				star.y += Math.cos(time * 0.001 + star.twinklePhase) * 0.05

				// Wrap around edges
				if (star.x < 0) {
					star.x = canvas.width
				}
				if (star.x > canvas.width) {
					star.x = 0
				}
				if (star.y < 0) {
					star.y = canvas.height
				}
				if (star.y > canvas.height) {
					star.y = 0
				}
			})

			animationId = requestAnimationFrame(animate)
		}

		animate()

		// Cleanup
		return () => {
			window.removeEventListener("resize", resizeCanvas)
			cancelAnimationFrame(animationId)
		}
	}, [])

	return (
		<canvas
			ref={canvasRef}
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				width: "100%",
				height: "100%",
				pointerEvents: "none",
				zIndex: -1,
				opacity: 0.6,
			}}
		/>
	)
}
