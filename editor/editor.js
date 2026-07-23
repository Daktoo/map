(function () {
    'use strict';

    // The old in-page "Editor mode" overlay has been retired in favour of
    // the standalone Admin panel (admin/), which edits the same
    // data/marker_world.json and data/railway.json files directly.
    function addToggleButton() {
        var btn = document.createElement('button');
        btn.id = 'editor-toggle-btn';
        btn.textContent = 'Admin';
        btn.addEventListener('click', function () {
            window.location.href = '../admin/index.html';
        });
        document.body.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addToggleButton);
    } else {
        addToggleButton();
    }
})();
