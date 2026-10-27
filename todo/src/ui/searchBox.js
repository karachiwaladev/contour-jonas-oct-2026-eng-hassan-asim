// The search box: sends its text on every keystroke; × or Esc clears it (and shows everything
// again). The text only ever lives in the input's value, never in the page as HTML.
/**
 * @param input    <input type="search">
 * @param clearBtn the × button (hidden while the box is empty)
 * @param onChange (query: string) => void
 */
export function bindSearchBox(input, clearBtn, onChange) {
  const send = () => {
    clearBtn.hidden = input.value === '';
    onChange(input.value);
  };
  const clear = () => {
    input.value = '';
    send();
    input.focus();
  };
  input.value = ''; // the search isn't kept across reloads, whatever the browser restores
  clearBtn.hidden = true;
  input.addEventListener('input', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value !== '') {
      e.preventDefault();
      clear();
    }
  });
  clearBtn.addEventListener('click', clear);
}
