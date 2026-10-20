import { CheckIcon } from '../icons/NavIcons'

interface WizardProgressProps {
  steps: string[] // one label per step, in order
  currentStep: number // 1-based
  // The furthest step reached so far — a step at or before this is clickable (jump back freely
  // without losing anything already typed); anything past it isn't, since its fields haven't been
  // validated yet.
  maxStepReached: number
  onStepClick: (step: number) => void
}

// "Step X of N" plus a row of numbered, labeled stops connected by a line — reusable anywhere a
// multi-step flow needs to show progress and let someone jump back to a step they've already
// passed (see EventForm.tsx's Add Event wizard for the first use).
export function WizardProgress({ steps, currentStep, maxStepReached, onStepClick }: WizardProgressProps) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[12px] font-bold tracking-[0.5px] text-[#0d9488] uppercase">
        Step {currentStep} of {steps.length}
      </span>
      <div className="flex items-start">
        {steps.map((label, i) => {
          const stepNum = i + 1
          const isCurrent = stepNum === currentStep
          const isDone = stepNum < currentStep
          const isClickable = stepNum <= maxStepReached && !isCurrent
          return (
            <div key={label} className={`flex items-start ${stepNum < steps.length ? 'flex-1' : ''}`}>
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(stepNum)}
                className={`flex shrink-0 flex-col items-center gap-1.5 border-none bg-transparent ${
                  isClickable ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-extrabold [transition:background-color_150ms_ease,color_150ms_ease] ${
                    isCurrent
                      ? 'bg-[#0d9488] text-white shadow-[0_0_0_4px_rgba(13,148,136,0.15)]'
                      : isDone
                        ? 'bg-[#ccfbf1] text-[#0d9488]'
                        : 'bg-[#eef1f6] text-[#9aa6ba]'
                  }`}
                >
                  {isDone ? <CheckIcon size={15} /> : stepNum}
                </span>
                <span
                  className={`w-[92px] text-center text-[11.5px] leading-tight font-semibold whitespace-nowrap max-[480px]:w-[70px] max-[480px]:whitespace-normal ${
                    isCurrent ? 'text-[#12284a]' : 'text-[#9aa6ba]'
                  }`}
                >
                  {label}
                </span>
              </button>
              {stepNum < steps.length && (
                <div className={`mt-[17px] h-0.5 flex-1 rounded-full ${isDone ? 'bg-[#0d9488]' : 'bg-[#eef1f6]'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
