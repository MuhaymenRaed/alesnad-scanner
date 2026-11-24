import { Camera, CameraOff, Loader2, ScanLine, Search } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef, type FormEvent } from 'react'
import { MAX_BARCODE_LENGTH } from '../../shared/barcode'
import { card, darkButton, primaryButton } from './ui'

export interface BarcodeInputHandle {
  /** Focus the field and select its text so the next scan replaces it. */
  focusAndSelect(): void
  setValue(value: string): void
}

interface Props {
  loading: boolean
  cameraOpen: boolean
  onSubmit(value: string): void
  onToggleCamera(): void
}

/**
 * Keyboard-wedge friendly input: USB/Bluetooth scanners "type" the code and press Enter.
 * Only Enter / the Search button submits — never individual keystrokes.
 *
 * Laid out with a container query: field and buttons sit in one row when the card is wide
 * (iPad portrait, desktop without sidebar) and stack when it is narrow (phones, sidebar).
 */
export const BarcodeInput = forwardRef<BarcodeInputHandle, Props>(function BarcodeInput(props, ref) {
  const inputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focusAndSelect() {
      inputRef.current?.focus({ preventScroll: true })
      inputRef.current?.select()
    },
    setValue(value) {
      if (inputRef.current) inputRef.current.value = value
    },
  }))

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Read the raw string: no number conversion, so leading zeros survive.
    props.onSubmit(inputRef.current?.value ?? '')
    inputRef.current?.select()
  }

  return (
    <form onSubmit={handleSubmit} className={`@container p-4 sm:p-5 ${card}`} aria-label="Barcode lookup">
      <label htmlFor="barcode" className="flex items-center gap-2 text-sm font-extrabold">
        <ScanLine className="size-4 text-brand" aria-hidden />
        Barcode <span lang="ar" className="font-semibold text-muted">· الباركود</span>
      </label>
      <div className="mt-3 flex flex-col gap-2.5 @lg:flex-row">
        <input
          ref={inputRef}
          id="barcode"
          name="barcode"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={MAX_BARCODE_LENGTH + 20}
          placeholder="Scan or type a barcode"
          aria-describedby="barcode-help"
          className="min-h-14 w-full min-w-0 flex-1 rounded-control border-[1.5px] border-line bg-canvas px-4 font-mono text-xl tracking-wider text-ink placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-muted focus:border-brand focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand/15"
        />
        <div className="grid grid-cols-2 gap-2.5 @lg:flex">
          <button type="submit" disabled={props.loading} className={`${primaryButton} min-h-14 text-base disabled:cursor-wait`}>
            {props.loading ? <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden /> : <Search className="size-5" aria-hidden />}
            {props.loading ? 'Searching…' : 'Search'}
          </button>
          <button type="button" onClick={props.onToggleCamera} aria-pressed={props.cameraOpen} className={`${darkButton} min-h-14 text-base`}>
            {props.cameraOpen ? <CameraOff className="size-5" aria-hidden /> : <Camera className="size-5" aria-hidden />}
            <span>{props.cameraOpen ? 'Close camera' : 'Camera'}</span>
          </button>
        </div>
      </div>
      <p id="barcode-help" className="mt-3 text-sm leading-relaxed text-muted">
        With a USB or Bluetooth scanner, just scan — the code is entered and searched automatically. You can also type or paste a code and press Enter.
      </p>
    </form>
  )
})
