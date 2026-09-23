# Fusion Check-In

React 19 + TypeScript + Vite admin app for the University of Windsor's Fusion Innovation &
Entrepreneurship Network. Supabase (Postgres + Auth + Realtime + RLS) backend, deployed to
Cloudflare Pages.

## Keyboard accessibility — required for every new page/component

The whole app must be operable with no mouse: Tab / Shift+Tab, Enter, Space, Arrow keys, Escape.
Before considering any new UI done, check it against this list:

- **Native elements first.** Use `<button>`, `<a href>`, `<input>`, `<select>`, `<label>` instead
  of a `div`/`span` with `onClick` — they get keyboard behavior for free. If a clickable
  row/card genuinely can't be a real element (e.g. a `<tr>`), spread
  `rowActivationProps(onActivate)` from `src/lib/rowActivation.ts` onto it.
- **Focus order matches visual order**, and every interactive element is reachable by Tab alone.
- **Visible focus indicator on everything** — never `outline: none` without a real replacement
  (this app's convention: `focus:border-<color> focus:shadow-[0_0_0_3px_rgba(...)] focus:outline-none`
  on inputs, or `focus-visible:outline-2` on non-input clickable elements).
- **Custom dropdowns/comboboxes** (see `TypeaheadInput`, `ProgramAutocomplete`, `TimePicker` for
  the established pattern): ArrowUp/ArrowDown move a highlighted option, Enter selects it (only
  when something's highlighted — otherwise Enter falls through to the form), Escape closes.
  `role="combobox"`, `aria-expanded`, `aria-activedescendant` on the input; `role="listbox"`/
  `role="option"` + `aria-selected` on the list.
- **Modals/popovers** (see `Modal.tsx`): open → focus moves into it; Tab is trapped inside; close
  → focus returns to whatever opened it; Escape closes. Use the shared `Modal` component rather
  than a one-off implementation — the focus trap is already built in.
- **Multi-step forms**: Enter in a field should advance/submit, not silently do nothing (see
  `EventForm.tsx`'s `handleFormKeyDown` — checks `e.defaultPrevented` so a child combobox/time
  picker that already consumed Enter for its own selection isn't double-handled).
- **Every input has a real label** — `<label htmlFor>` wired to a matching `id`, or `aria-label`
  when there's no visible label text (a search box's icon-only affordance, for instance).
  Placeholder text alone is not a label.
- **Validation errors** are wired with `aria-invalid` + `aria-describedby` pointing at the error
  message's own `id`, and the error message has `role="alert"`.
- **Icon-only buttons** need `aria-label` describing the action, unless there's already visible
  text alongside the icon.
- **Toggle/segmented-control button groups** (Status mode, Registration type, etc.) get
  `aria-pressed` on each button and `role="group"` + `aria-label` on the wrapper.
- **Skip-to-content**: already present in `DashboardLayout.tsx` — don't remove it, and if a new
  top-level layout is added alongside it, give that one too.

When you touch a page, do a real keyboard-only pass on it (no mouse) before calling the work
done: can you reach every control, see where focus is at all times, and complete the flow?
