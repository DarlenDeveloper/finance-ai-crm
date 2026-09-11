import Image from "next/image"

type MercuryLogoProps = {
  variant?: "full" | "mark"
  className?: string
  priority?: boolean
}

export function MercuryLogo({ variant = "full", className = "", priority = false }: MercuryLogoProps) {
  const isMark = variant === "mark"

  return (
    <Image
      src={isMark ? "/mercury-mark.png" : "/mercury-logo.png"}
      width={isMark ? 256 : 786}
      height={isMark ? 256 : 154}
      alt="Mercury Computers Limited"
      className={`block object-contain ${className}`}
      priority={priority}
    />
  )
}
