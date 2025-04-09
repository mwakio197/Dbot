document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.querySelector('.menu-toggle');
    const sideMenu = document.querySelector('.side-menu');
    const hideMenu = document.querySelector('.hide-menu');

    menuToggle.addEventListener('click', function() {
        sideMenu.classList.toggle('open');
    });

    hideMenu.addEventListener('click', function() {
        sideMenu.classList.remove('open');
    });

    const authButton = document.querySelector('.auth-button');
    const content = document.querySelector('.content');

    function updateAuthButtonState(isAuthenticated) {
        authButton.innerHTML = isAuthenticated ? 
            '<i class="fas fa-sign-out-alt"></i> Logout' : 
            '<i class="fas fa-sign-in-alt"></i> Demo Login';
    }

    function generateDemoToken() {
        return {
            token: 'demo_' + Math.random().toString(36).substring(2),
            accounts: [
                {
                    loginid: 'VRTC1234',
                    token: 'demo_vrt_' + Math.random().toString(36).substring(2),
                    currency: 'USD',
                    balance: 10000,
                    is_virtual: true
                },
                {
                    loginid: 'CR1234',
                    token: 'demo_cr_' + Math.random().toString(36).substring(2),
                    currency: 'USD',
                    balance: 0,
                    is_virtual: false
                }
            ]
        };
    }

    authButton.addEventListener('click', function() {
        if (localStorage.getItem('authToken')) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('accounts');
            location.reload();
        } else {
            const demoData = generateDemoToken();
            localStorage.setItem('authToken', demoData.token);
            localStorage.setItem('accounts', JSON.stringify(demoData.accounts));
            init();
        }
        updateAuthButtonState(!!localStorage.getItem('authToken'));
    });

    async function validateToken() {
        const token = localStorage.getItem('authToken');
        return !!token;
    }

    function getAppConfig() {
        const host = window.location.hostname;
        return {
            app_id: host === 'localhost' || host === '127.0.0.1' ? '36300' : '68848',
            server_url: 'wss://ws.binaryws.com/websockets/v3'
        };
    }

    async function init() {
        const isValid = await validateToken();
        updateAuthButtonState(isValid);
        
        if (isValid) {
            window.connectWebSocket();
            content.style.display = 'block';
        } else {
            content.style.display = 'none';
        }
    }

    // Add navigation handling
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');

    function updatePageFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const page = urlParams.get('page') || 'dashboard';
        const mainHeader = document.querySelector('.main-content h1');

        navLinks.forEach(link => {
            const linkPage = link.getAttribute('data-page');
            link.classList.toggle('active', linkPage === page);
            if (linkPage === page) {
                mainHeader.textContent = link.textContent.trim();
            }
        });

        pages.forEach(p => {
            p.classList.toggle('active', p.id === `${page}-page`);
        });

        sideMenu.classList.remove('open');
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.getAttribute('data-page');
            const url = new URL(window.location);
            url.searchParams.set('page', targetPage);
            window.history.pushState({}, '', url);
            updatePageFromUrl();
        });
    });

    // Handle browser back/forward navigation
    window.addEventListener('popstate', updatePageFromUrl);

    // Initial page load
    updatePageFromUrl();

    init();
});
