// A small searchable picker following the ARIA combobox pattern: a text input filters a listbox,
// arrow keys move the highlight, Enter or a click selects.

/** Lowercase without diacritics, so "gebaude" finds "Gebäude". */
export function normalizeSearch(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}

/** True when every word of the query occurs in the text. */
export function matchesSearch(query, text) {
  const haystack = normalizeSearch(text);
  return normalizeSearch(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * @param options.input the text input (role="combobox")
 * @param options.listbox the <ul role="listbox">
 * @param options.items (query) => [{ title, detail?, group?, search }] already filtered or not;
 *        items without `search` are always shown (e.g. an "add custom" entry)
 * @param options.onSelect (item) => void
 * @param options.keepOpen keep the list open after selecting (for adding several entries)
 * @param options.onClose called when the list closes without a selection (Escape, blur)
 */
export function createCombobox({ input, listbox, items, onSelect, keepOpen = false, onClose = () => {} }) {
  let visible = [];
  let active = -1;

  const isOpen = () => !listbox.hidden;

  function render(query = input.value.trim()) {
    visible = items(query).filter((item) => item.search === undefined || matchesSearch(query, item.search));
    let group = null;
    const html = [];
    visible.forEach((item, i) => {
      if (item.group && item.group !== group) {
        group = item.group;
        html.push(`<li role="presentation" class="group">${escapeHtml(group)}</li>`);
      }
      const detail = item.detail ? `<span class="option-detail">${escapeHtml(item.detail)}</span>` : "";
      html.push(
        `<li role="option" id="${listbox.id}-${i}" data-index="${i}" aria-selected="false">` +
          `<span class="option-title">${escapeHtml(item.title)}</span>${detail}</li>`,
      );
    });
    listbox.innerHTML = html.length ? html.join("") : `<li role="presentation" class="empty">Keine Treffer</li>`;
    setActive(query && visible.length ? 0 : -1);
  }

  function setActive(index) {
    listbox.querySelector('[aria-selected="true"]')?.setAttribute("aria-selected", "false");
    active = index;
    const option = index >= 0 ? listbox.querySelector(`[data-index="${index}"]`) : null;
    if (option) {
      option.setAttribute("aria-selected", "true");
      option.scrollIntoView({ block: "nearest" });
      input.setAttribute("aria-activedescendant", option.id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  /** Opens the list; `filtered: false` shows all entries (on focus, before the user typed). */
  function open({ filtered = true } = {}) {
    listbox.hidden = false;
    input.setAttribute("aria-expanded", "true");
    render(filtered ? undefined : "");
  }

  function close() {
    if (!isOpen()) return;
    listbox.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function choose(index) {
    const item = visible[index];
    if (!item) return;
    onSelect(item);
    if (keepOpen && document.activeElement === input) {
      input.value = "";
      render();
    } else {
      close();
    }
  }

  input.addEventListener("focus", () => {
    input.select();
    open({ filtered: false });
  });
  input.addEventListener("input", () => open());
  input.addEventListener("blur", () => {
    close();
    onClose();
  });
  input.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen()) open({ filtered: false });
        setActive(Math.min(active + 1, visible.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(Math.max(active - 1, 0));
        break;
      case "Enter":
        event.preventDefault();
        if (isOpen() && active >= 0) choose(active);
        break;
      case "Escape":
        if (isOpen()) {
          event.preventDefault();
          close();
          onClose();
        }
        break;
      default:
    }
  });
  // Keep the focus in the input while clicking an option.
  listbox.addEventListener("mousedown", (event) => event.preventDefault());
  listbox.addEventListener("click", (event) => {
    const option = event.target.closest("[data-index]");
    if (option) choose(Number(option.dataset.index));
  });

  return { refresh: () => isOpen() && render(), close };
}
