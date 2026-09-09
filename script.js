
(function () {
  'use strict';

  var CONFIG = {
    whatsappPhone: '573107309933',
    maxHuespedes: 12,
    maxDiasAnticipacion: 730          
  };

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Elementos que pueden recibir foco dentro de un contenedor (para el focus trap). */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** Bloquea/desbloquea el scroll del documento sin provocar saltos. */
  var scrollLock = (function () {
    var locks = 0;
    return {
      on: function () { locks++; document.body.classList.add('is-locked'); },
      off: function () { locks = Math.max(0, locks - 1); if (!locks) document.body.classList.remove('is-locked'); }
    };
  })();

  /** Mantiene el foco dentro del contenedor mientras esté abierto. */
  function trapFocus(container, event) {
    var focusables = $$(FOCUSABLE, container).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
    if (!focusables.length) return;

    var first = focusables[0];
    var last  = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }


  function formatearFecha(iso) {
    var partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!partes) return '';
    var fecha = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
    try {
      return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return partes[3] + '/' + partes[2] + '/' + partes[1];
    }
  }

  function hoyISO(offsetDias) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDias || 0));
    var mes = String(d.getMonth() + 1).padStart(2, '0');
    var dia = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mes + '-' + dia;
  }


  (function initHeader() {
    var header = $('#siteHeader');
    if (!header) return;

    var ticking = false;
    function update() {
      header.classList.toggle('is-scrolled', window.scrollY > 40);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  })();


  (function initNav() {
    var toggle   = $('#navToggle');
    var nav      = $('#siteNav');
    var backdrop = $('#navBackdrop');
    if (!toggle || !nav || !backdrop) return;

    function abrir() {
      nav.classList.add('is-open');
      backdrop.hidden = false;
      window.requestAnimationFrame(function () { backdrop.classList.add('is-visible'); });
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Cerrar menú de navegación');
      scrollLock.on();
    }

    function cerrar() {
      nav.classList.remove('is-open');
      backdrop.classList.remove('is-visible');
      window.setTimeout(function () { backdrop.hidden = true; }, 280);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Abrir menú de navegación');
      scrollLock.off();
    }

    function estaAbierto() { return toggle.getAttribute('aria-expanded') === 'true'; }

    toggle.addEventListener('click', function () { estaAbierto() ? cerrar() : abrir(); });
    backdrop.addEventListener('click', cerrar);


    $$('.nav-link, .nav-cta', nav).forEach(function (link) {
      link.addEventListener('click', function () { if (estaAbierto()) cerrar(); });
    });

    document.addEventListener('keydown', function (e) {
      if (!estaAbierto()) return;
      if (e.key === 'Escape') { cerrar(); toggle.focus(); }
      else if (e.key === 'Tab') { trapFocus(nav, e); }
    });

    window.matchMedia('(min-width: 901px)').addEventListener('change', function (e) {
      if (e.matches && estaAbierto()) cerrar();
    });
  })();


  /* ========================================================================
     04. SCROLLSPY: ENLACE ACTIVO EN LA NAVEGACIÓN
     ======================================================================== */
  (function initScrollspy() {
    var links = $$('.nav-link');
    if (!links.length || !('IntersectionObserver' in window)) return;

    var mapa = {};
    var secciones = [];

    links.forEach(function (link) {
      var id = (link.getAttribute('href') || '').replace('#', '');
      var seccion = id ? document.getElementById(id) : null;
      if (seccion) { mapa[id] = link; secciones.push(seccion); }
    });

    var observer = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        links.forEach(function (l) { l.classList.remove('is-active'); });
        var activo = mapa[entrada.target.id];
        if (activo) activo.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    secciones.forEach(function (s) { observer.observe(s); });
  })();


  /* ========================================================================
     04b. CONTROLES DE VIDRIO (selector de huéspedes y de fechas)
     --------------------------------------------------------------------
     Mejora progresiva: el <select> y los <input type="date"> del formulario
     de reserva siguen siendo la fuente de verdad (valor, min, max, change).
     Aquí se ocultan y se coloca encima un control propio con la estética del
     sitio, porque el desplegable y el calendario nativos no son estilizables.
     Sin JavaScript el formulario conserva los controles nativos.

     Los paneles flotantes se montan en <body> con position:fixed para que el
     desbordamiento del modal no los recorte.
     ======================================================================== */
  var glass = (function () {
    var secuencia = 0;
    var activo = null;                 // panel abierto actualmente
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var DIAS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];

    function nuevoId(prefijo) { secuencia++; return prefijo + '-' + secuencia; }

    /** Icono del sprite ya existente en el documento. */
    function icono(nombre, clases) {
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', clases || 'ico');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', '#' + nombre);
      svg.appendChild(use);
      return svg;
    }

    /** Dispara un evento de forma compatible (el control nativo sigue mandando). */
    function disparar(el, tipo) {
      var ev;
      try {
        ev = new Event(tipo, { bubbles: true });
      } catch (e) {
        ev = document.createEvent('Event');
        ev.initEvent(tipo, true, false);
      }
      el.dispatchEvent(ev);
    }

    function capitalizar(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

    /* --- Utilidades de fecha en formato 'YYYY-MM-DD' (sin zona horaria) --- */
    function aISO(y, m, d) {
      return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    function deISO(iso) {
      var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
      return p ? { y: Number(p[1]), m: Number(p[2]) - 1, d: Number(p[3]) } : null;
    }
    function sumarDias(iso, n) {
      var p = deISO(iso);
      if (!p) return iso;
      var f = new Date(p.y, p.m, p.d + n);
      return aISO(f.getFullYear(), f.getMonth(), f.getDate());
    }
    function diasDelMes(y, m) { return new Date(y, m + 1, 0).getDate(); }
    /** Índice de la primera columna con la semana empezando en lunes. */
    function primerHueco(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; }

    function fechaCorta(iso) {
      var p = deISO(iso);
      if (!p) return '';
      var f = new Date(p.y, p.m, p.d);
      try {
        return f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
                .replace(/\sde\s/g, ' ')
                .replace(/\./g, '');
      } catch (e) {
        return aISO(p.y, p.m, p.d).split('-').reverse().join('/');
      }
    }

    /* --- Posicionamiento del panel flotante --- */
    function colocar(pop, ancla) {
      var margen = 8;
      var r = ancla.getBoundingClientRect();
      pop.style.left = '0px';
      pop.style.top = '0px';
      var ancho = pop.offsetWidth;
      var alto = pop.offsetHeight;

      var izq = Math.max(margen, Math.min(r.left, window.innerWidth - ancho - margen));
      var arr = r.bottom + 6;
      if (arr + alto > window.innerHeight - margen) {
        var encima = r.top - alto - 6;
        arr = encima >= margen ? encima : Math.max(margen, window.innerHeight - alto - margen);
      }
      pop.style.left = Math.round(izq) + 'px';
      pop.style.top = Math.round(arr) + 'px';
    }

    function cerrarTodo() { if (activo) activo.cerrar(false); }

    /* Cierre al pulsar fuera y reposicionado al desplazar o redimensionar */
    document.addEventListener('mousedown', function (e) {
      if (!activo) return;
      if (activo.pop.contains(e.target) || activo.trigger.contains(e.target)) return;
      activo.cerrar(false);
    }, true);
    window.addEventListener('resize', function () { if (activo) activo.recolocar(); });
    window.addEventListener('scroll', function () { if (activo) activo.recolocar(); }, true);

    /* --------------------------------------------------------------------
       Estructura común: envoltura + disparador, con el nativo oculto dentro
       -------------------------------------------------------------------- */
    function base(nativo, opciones) {
      var campo = nativo.parentNode;

      var envoltura = document.createElement('div');
      envoltura.className = 'gc';
      campo.insertBefore(envoltura, nativo);
      envoltura.appendChild(nativo);
      nativo.classList.add('gc-native');

      var trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'gc-trigger';
      trigger.id = nuevoId('gc-t');
      trigger.setAttribute('aria-haspopup', opciones.haspopup);
      trigger.setAttribute('aria-expanded', 'false');

      if (opciones.icono) trigger.appendChild(icono(opciones.icono, 'ico gc-lead'));

      var valor = document.createElement('span');
      valor.className = 'gc-value';
      valor.id = nuevoId('gc-v');
      trigger.appendChild(valor);

      if (opciones.caret) trigger.appendChild(icono('i-chevron-down', 'ico gc-caret'));
      envoltura.appendChild(trigger);

      /* La etiqueta ya no puede apuntar al control nativo oculto */
      var etiqueta = null;
      $$('label', campo).forEach(function (l) {
        if (l.getAttribute('for') === nativo.id) etiqueta = l;
      });
      if (etiqueta) {
        if (!etiqueta.id) etiqueta.id = nuevoId('gc-l');
        etiqueta.removeAttribute('for');
        etiqueta.style.cursor = 'pointer';
        etiqueta.addEventListener('click', function () { trigger.focus(); });
        trigger.setAttribute('aria-labelledby', etiqueta.id + ' ' + valor.id);
      }

      /* Refleja aria-invalid (lo pone la validación del formulario) */
      if (window.MutationObserver) {
        new MutationObserver(function () {
          var mal = nativo.getAttribute('aria-invalid') === 'true';
          envoltura.classList.toggle('is-invalid', mal);
        }).observe(nativo, { attributes: true, attributeFilter: ['aria-invalid'] });
      }

      /* El foco programático del formulario se redirige al disparador */
      nativo.__gcFocus = function () { trigger.focus(); };

      return { envoltura: envoltura, trigger: trigger, valor: valor };
    }

    /* --------------------------------------------------------------------
       Ciclo de apertura y cierre compartido por lista y calendario
       -------------------------------------------------------------------- */
    function panel(b, pop, alAbrir, trasAbrir) {
      var espera = null;

      function recolocar() { colocar(pop, b.trigger); }

      function abierto() { return activo && activo.pop === pop; }

      function abrir() {
        if (abierto()) return;
        cerrarTodo();
        if (espera) { window.clearTimeout(espera); espera = null; }
        pop.hidden = false;
        if (alAbrir) alAbrir();
        recolocar();
        b.trigger.setAttribute('aria-expanded', 'true');
        b.envoltura.classList.add('is-open');
        activo = { pop: pop, trigger: b.trigger, cerrar: cerrar, recolocar: recolocar };
        window.requestAnimationFrame(function () { pop.classList.add('is-open'); });
        if (trasAbrir) trasAbrir();
      }

      function cerrar(devolverFoco) {
        if (activo && activo.pop === pop) activo = null;
        pop.classList.remove('is-open');
        b.trigger.setAttribute('aria-expanded', 'false');
        b.envoltura.classList.remove('is-open');
        if (espera) window.clearTimeout(espera);
        espera = window.setTimeout(function () { pop.hidden = true; espera = null; }, 200);
        if (devolverFoco) b.trigger.focus();
      }

      b.trigger.addEventListener('click', function () {
        abierto() ? cerrar(true) : abrir();
      });

      b.trigger.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); abrir(); }
      });

      return { abrir: abrir, cerrar: cerrar, abierto: abierto, recolocar: recolocar };
    }

    /* --------------------------------------------------------------------
       Selector de opciones (reemplaza el desplegable nativo)
       -------------------------------------------------------------------- */
    function mejorarSelect(nativo, nombreIcono) {
      if (!nativo || nativo.dataset.gc) return;
      nativo.dataset.gc = '1';

      var b = base(nativo, { icono: nombreIcono, caret: true, haspopup: 'listbox' });

      var lista = document.createElement('div');
      lista.className = 'gc-pop gc-list';
      lista.id = nuevoId('gc-lb');
      lista.setAttribute('role', 'listbox');
      lista.hidden = true;
      document.body.appendChild(lista);
      b.trigger.setAttribute('aria-controls', lista.id);

      var botones = [];
      Array.prototype.forEach.call(nativo.options, function (op) {
        var boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'gc-opt';
        boton.setAttribute('role', 'option');
        boton.tabIndex = -1;
        boton.appendChild(icono('i-check', 'ico gc-check'));

        var texto = document.createElement('span');
        texto.textContent = op.text.replace(/\s+/g, ' ').trim();   // textContent: nunca innerHTML
        boton.appendChild(texto);

        boton.addEventListener('click', function () { elegir(op.value); });
        lista.appendChild(boton);
        botones.push(boton);
      });

      var ctrl = panel(b, lista, function () {
        var r = b.trigger.getBoundingClientRect();
        lista.style.setProperty('--gc-ancho', Math.round(Math.max(200, r.width)) + 'px');
      }, function () {
        botones[nativo.selectedIndex < 0 ? 0 : nativo.selectedIndex].focus();
      });

      function pintar() {
        var i = nativo.selectedIndex;
        b.valor.textContent = i >= 0 ? botones[i].lastChild.textContent : '';
        botones.forEach(function (boton, j) {
          boton.setAttribute('aria-selected', j === i ? 'true' : 'false');
        });
      }

      function elegir(valor) {
        nativo.value = valor;
        disparar(nativo, 'change');
        pintar();
        ctrl.cerrar(true);
      }

      function mover(delta) {
        var actual = botones.indexOf(document.activeElement);
        if (actual < 0) actual = nativo.selectedIndex;
        var siguiente = Math.max(0, Math.min(botones.length - 1, actual + delta));
        botones[siguiente].focus();
      }

      lista.addEventListener('keydown', function (e) {
        switch (e.key) {
          case 'ArrowDown': e.preventDefault(); e.stopPropagation(); mover(1); break;
          case 'ArrowUp':   e.preventDefault(); e.stopPropagation(); mover(-1); break;
          case 'Home':      e.preventDefault(); e.stopPropagation(); botones[0].focus(); break;
          case 'End':       e.preventDefault(); e.stopPropagation(); botones[botones.length - 1].focus(); break;
          case 'Escape':    e.stopPropagation(); ctrl.cerrar(true); break;
          case 'Tab':       ctrl.cerrar(true); break;   // sin stopPropagation: sigue el foco del modal
        }
      });

      nativo.addEventListener('change', pintar);
      pintar();
    }

    /* --------------------------------------------------------------------
       Calendario (reemplaza el selector de fecha nativo)
       -------------------------------------------------------------------- */
    function mejorarFecha(nativo, nombreIcono, textoVacio) {
      if (!nativo || nativo.dataset.gc) return;
      nativo.dataset.gc = '1';

      var b = base(nativo, { icono: nombreIcono, caret: false, haspopup: 'dialog' });

      var pop = document.createElement('div');
      pop.className = 'gc-pop gcal';
      pop.id = nuevoId('gc-cal');
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Selecciona una fecha');
      pop.hidden = true;
      b.trigger.setAttribute('aria-controls', pop.id);

      var cabecera = document.createElement('div');
      cabecera.className = 'gcal-head';

      var btnAnterior = document.createElement('button');
      btnAnterior.type = 'button';
      btnAnterior.className = 'gcal-nav';
      btnAnterior.setAttribute('aria-label', 'Mes anterior');
      btnAnterior.appendChild(icono('i-chevron-left'));

      var titulo = document.createElement('div');
      titulo.className = 'gcal-month';
      titulo.setAttribute('aria-live', 'polite');

      var btnSiguiente = document.createElement('button');
      btnSiguiente.type = 'button';
      btnSiguiente.className = 'gcal-nav';
      btnSiguiente.setAttribute('aria-label', 'Mes siguiente');
      btnSiguiente.appendChild(icono('i-chevron-right'));

      cabecera.appendChild(btnAnterior);
      cabecera.appendChild(titulo);
      cabecera.appendChild(btnSiguiente);

      var cabeceraDias = document.createElement('div');
      cabeceraDias.className = 'gcal-dow';
      cabeceraDias.setAttribute('aria-hidden', 'true');
      DIAS.forEach(function (d) {
        var s = document.createElement('span');
        s.textContent = d;
        cabeceraDias.appendChild(s);
      });

      var rejilla = document.createElement('div');
      rejilla.className = 'gcal-grid';
      rejilla.setAttribute('role', 'group');
      rejilla.setAttribute('aria-label', 'Días del mes');

      pop.appendChild(cabecera);
      pop.appendChild(cabeceraDias);
      pop.appendChild(rejilla);
      document.body.appendChild(pop);

      var vista = null;      // { y, m } mes mostrado
      var foco = null;       // ISO del día que recibe el foco

      function limites() {
        return { min: nativo.min || '', max: nativo.max || '' };
      }
      function acotar(iso) {
        var l = limites();
        if (l.min && iso < l.min) return l.min;
        if (l.max && iso > l.max) return l.max;
        return iso;
      }
      function permitido(iso) {
        var l = limites();
        return !((l.min && iso < l.min) || (l.max && iso > l.max));
      }

      function pintarMes() {
        var y = vista.y, m = vista.m, l = limites();

        try {
          titulo.textContent = capitalizar(
            new Date(y, m, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
          );
        } catch (e) {
          titulo.textContent = (m + 1) + '/' + y;
        }

        var ultimoAnterior = sumarDias(aISO(y, m, 1), -1);
        var primeroSiguiente = sumarDias(aISO(y, m, diasDelMes(y, m)), 1);
        btnAnterior.disabled = !!(l.min && ultimoAnterior < l.min);
        btnSiguiente.disabled = !!(l.max && primeroSiguiente > l.max);

        while (rejilla.firstChild) rejilla.removeChild(rejilla.firstChild);

        var huecos = primerHueco(y, m);
        for (var h = 0; h < huecos; h++) {
          var vacio = document.createElement('span');
          vacio.className = 'gcal-blank';
          vacio.setAttribute('aria-hidden', 'true');
          rejilla.appendChild(vacio);
        }

        var hoy = hoyISO(0);
        var total = diasDelMes(y, m);
        for (var d = 1; d <= total; d++) {
          var iso = aISO(y, m, d);
          var dia = document.createElement('button');
          dia.type = 'button';
          dia.className = 'gcal-day';
          dia.textContent = String(d);
          dia.setAttribute('data-iso', iso);
          dia.setAttribute('aria-label', formatearFecha(iso));
          dia.setAttribute('aria-pressed', nativo.value === iso ? 'true' : 'false');
          if (iso === hoy) dia.setAttribute('aria-current', 'date');
          dia.disabled = !permitido(iso);
          dia.tabIndex = iso === foco ? 0 : -1;
          rejilla.appendChild(dia);
        }

        /* Si el día con foco quedó fuera del mes visible, se reasigna */
        if (!rejilla.querySelector('.gcal-day[tabindex="0"]')) {
          var candidato = rejilla.querySelector('.gcal-day:not(:disabled)');
          if (candidato) {
            candidato.tabIndex = 0;
            foco = candidato.getAttribute('data-iso');
          }
        }
      }

      function enfocarDia(iso) {
        var dia = rejilla.querySelector('.gcal-day[data-iso="' + iso + '"]');
        if (dia) dia.focus();
      }

      function irA(iso, enfocar) {
        var p = deISO(iso);
        if (!p) return;
        foco = iso;
        if (!vista || vista.y !== p.y || vista.m !== p.m) {
          vista = { y: p.y, m: p.m };
        }
        pintarMes();
        if (enfocar) enfocarDia(foco);
      }

      function moverMes(delta) {
        var destino = new Date(vista.y, vista.m + delta, 1);
        var y = destino.getFullYear();
        var m = destino.getMonth();
        var p = deISO(foco);
        var nuevo = aISO(y, m, p ? Math.min(p.d, diasDelMes(y, m)) : 1);
        if (!permitido(nuevo)) nuevo = acotar(nuevo);
        irA(nuevo, false);
      }

      function elegir(iso) {
        if (!permitido(iso)) return;
        nativo.value = iso;
        disparar(nativo, 'change');
        pintarValor();
        ctrl.cerrar(true);
      }

      function pintarValor() {
        var iso = nativo.value;
        if (iso) {
          b.valor.textContent = fechaCorta(iso);
          b.valor.classList.remove('is-empty');
        } else {
          b.valor.textContent = textoVacio;
          b.valor.classList.add('is-empty');
        }
      }

      var ctrl = panel(b, pop, function () {
        irA(nativo.value || acotar(hoyISO(0)), false);
      }, function () {
        enfocarDia(foco);
      });

      btnAnterior.addEventListener('click', function () { moverMes(-1); });
      btnSiguiente.addEventListener('click', function () { moverMes(1); });

      rejilla.addEventListener('click', function (e) {
        var dia = e.target.closest ? e.target.closest('.gcal-day') : null;
        if (dia && !dia.disabled) elegir(dia.getAttribute('data-iso'));
      });

      pop.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); ctrl.cerrar(true); return; }
        if (e.key === 'Tab')    { ctrl.cerrar(true); return; }

        var esDia = e.target.classList && e.target.classList.contains('gcal-day');
        var salto = 0;

        switch (e.key) {
          case 'ArrowLeft':  salto = -1; break;
          case 'ArrowRight': salto = 1; break;
          case 'ArrowUp':    salto = -7; break;
          case 'ArrowDown':  salto = 7; break;
          case 'PageUp':     e.preventDefault(); e.stopPropagation(); moverMes(-1); enfocarDia(foco); return;
          case 'PageDown':   e.preventDefault(); e.stopPropagation(); moverMes(1); enfocarDia(foco); return;
          case 'Home':
          case 'End':
            if (!esDia) return;
            e.preventDefault(); e.stopPropagation();
            var p = deISO(foco);
            if (!p) return;
            var indice = (new Date(p.y, p.m, p.d).getDay() + 6) % 7;
            irA(acotar(sumarDias(foco, e.key === 'Home' ? -indice : 6 - indice)), true);
            return;
          default: return;
        }

        if (!esDia) return;
        e.preventDefault();
        e.stopPropagation();
        var destino = sumarDias(foco, salto);
        if (!permitido(destino)) return;
        irA(destino, true);
      });

      nativo.addEventListener('change', pintarValor);
      pintarValor();
    }

    /** Redirige el foco programático de un campo mejorado a su disparador. */
    function enfocar(el) {
      if (!el) return;
      if (typeof el.__gcFocus === 'function') el.__gcFocus();
      else el.focus();
    }

    return {
      select: mejorarSelect,
      fecha: mejorarFecha,
      focus: enfocar,
      cerrarTodo: cerrarTodo
    };
  })();


  /* ========================================================================
     05. MODAL "VERIFICAR DISPONIBILIDAD"
     --------------------------------------------------------------------
     Los enlaces marcados con [data-reserva] conservan su href original a
     WhatsApp (funcionan sin JavaScript). Con JS activo abren el modal, que
     compone un mensaje ya redactado con las fechas y el número de huéspedes.
     ======================================================================== */
  (function initReserva() {
    var modal      = $('#reservaModal');
    var form       = $('#reservaForm');
    var inEntrada  = $('#fEntrada');
    var inSalida   = $('#fSalida');
    var inHuesp    = $('#fHuespedes');
    var errorBox   = $('#reservaError');
    var errorText  = $('#reservaErrorText');
    var disparadores = $$('[data-reserva]');
    if (!modal || !form || !disparadores.length) return;

    var ultimoFoco = null;

    // Límites del selector de fechas: nunca fechas pasadas
    var min = hoyISO(0);
    var max = hoyISO(CONFIG.maxDiasAnticipacion);
    inEntrada.min = min; inEntrada.max = max;
    inSalida.min  = min; inSalida.max  = max;

    // Controles propios (calendario y lista de huéspedes) sobre los nativos
    glass.fecha(inEntrada, 'i-calendar', 'Selecciona fecha');
    glass.fecha(inSalida, 'i-calendar', 'Selecciona fecha');
    glass.select(inHuesp, 'i-users');

    function limpiarError() {
      errorBox.hidden = true;
      errorText.textContent = '';
      inEntrada.removeAttribute('aria-invalid');
      inSalida.removeAttribute('aria-invalid');
    }

    function mostrarError(mensaje, campo) {
      errorText.textContent = mensaje;          // textContent: nunca innerHTML
      errorBox.hidden = false;
      if (campo) { campo.setAttribute('aria-invalid', 'true'); glass.focus(campo); }
    }

    function abrir() {
      ultimoFoco = document.activeElement;
      modal.hidden = false;
      window.requestAnimationFrame(function () { modal.classList.add('is-open'); });
      scrollLock.on();
      limpiarError();
      window.setTimeout(function () { glass.focus(inEntrada); }, 60);
    }

    function cerrar() {
      glass.cerrarTodo();
      modal.classList.remove('is-open');
      window.setTimeout(function () { modal.hidden = true; }, 280);
      scrollLock.off();
      if (ultimoFoco && typeof ultimoFoco.focus === 'function') ultimoFoco.focus();
    }

    disparadores.forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        abrir();
      });
    });

    $$('[data-close-modal]', modal).forEach(function (el) {
      el.addEventListener('click', cerrar);
    });

    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') cerrar();
      else if (e.key === 'Tab') trapFocus(modal, e);
    });

    // La salida nunca puede ser anterior a la llegada
    inEntrada.addEventListener('change', function () {
      limpiarError();
      if (inEntrada.value) {
        inSalida.min = inEntrada.value;
        if (inSalida.value && inSalida.value <= inEntrada.value) {
          inSalida.value = '';
          // notifica el cambio para que el control de vidrio repinte su valor
          inSalida.dispatchEvent(new Event('change'));
        }
      }
    });
    inSalida.addEventListener('change', limpiarError);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      limpiarError();

      var entrada = inEntrada.value;
      var salida  = inSalida.value;

      // --- Validación en cliente -------------------------------------
      if (!entrada) { return mostrarError('Selecciona la fecha de llegada.', inEntrada); }
      if (!salida)  { return mostrarError('Selecciona la fecha de salida.', inSalida); }
      if (entrada < min) { return mostrarError('La fecha de llegada no puede estar en el pasado.', inEntrada); }
      if (salida <= entrada) { return mostrarError('La fecha de salida debe ser posterior a la de llegada.', inSalida); }

      // --- Validación y formato de huéspedes -------------------------
      var huespedesVal = inHuesp.value;
      var txtHuespedes = '';
      
      if (huespedesVal === '12+') {
        txtHuespedes = 'más de 12 huéspedes';
      } else {
        var huespedes = parseInt(huespedesVal, 10);
        if (!isFinite(huespedes) || huespedes < 1) huespedes = 1;
        if (huespedes > CONFIG.maxHuespedes) huespedes = CONFIG.maxHuespedes;
        txtHuespedes = huespedes + (huespedes === 1 ? ' huésped' : ' huéspedes');
      }

      // --- Composición del mensaje -----------------------------------
      var mensaje =
        '¡Hola! Quisiera consultar disponibilidad y tarifa del ' + formatearFecha(entrada) +
        ' al ' + formatearFecha(salida) +
        ' para ' + txtHuespedes + '. ¡Gracias!';

      // URL construida con valores codificados; el teléfono es una constante local
      var url = 'https://api.whatsapp.com/send/?phone=' + encodeURIComponent(CONFIG.whatsappPhone) +
                '&text=' + encodeURIComponent(mensaje) +
                '&type=phone_number&app_absent=0';

      // noopener/noreferrer: evita que la pestaña destino acceda a window.opener
      window.open(url, '_blank', 'noopener,noreferrer');
      cerrar();
    });
  })();


  /* ========================================================================
     06. CARRUSEL DE HABITACIONES
     --------------------------------------------------------------------
     Avance automático lento con control manual. El desplazamiento nativo
     (scroll-snap) permite el gesto táctil; aquí sólo se añaden el temporizador,
     las flechas, los puntos y el contador, que se generan desde el DOM.
     Para añadir una habitación basta con duplicar un <li class="carousel-slide">.
     ======================================================================== */
  (function initCarrusel() {
    var carrusel = $('#roomCarousel');
    if (!carrusel) return;

    var viewport  = $('.carousel-viewport', carrusel);
    var diapos    = $$('.carousel-slide', carrusel);
    var listaDots = $('.carousel-dots', carrusel);
    var elActual  = $('.carousel-current', carrusel);
    var elTotal   = $('.carousel-total', carrusel);
    var btnPrev   = $('.carousel-prev', carrusel);
    var btnNext   = $('.carousel-next', carrusel);
    var barra     = $('.carousel-bar', carrusel);
    if (!viewport || !diapos.length) return;

    // Con una sola habitación no hay nada que rotar: se oculta la interfaz
    if (diapos.length < 2) {
      [btnPrev, btnNext, barra].forEach(function (el) { if (el) el.hidden = true; });
      return;
    }

    var INTERVALO = 7000;   // ms entre habitaciones
    var DESLIZA   = 1100;   // ms del desplazamiento automático (lento)
    var MANUAL    = 550;    // ms al pulsar flecha o punto

    var indice = 0;
    var animando = false;
    var temporizador = null;
    var pausaPuntero = false;   // el cursor está sobre el carrusel
    var pausaFoco    = false;   // hay foco de teclado dentro

    function dosDigitos(n) { return (n < 10 ? '0' : '') + n; }

    elTotal.textContent = dosDigitos(diapos.length);

    // --- Puntos de navegación, generados a partir de las diapositivas ---
    var puntos = diapos.map(function (_, i) {
      var li = document.createElement('li');
      var boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'carousel-dot';
      boton.setAttribute('aria-label', 'Ir a la habitación ' + (i + 1));
      boton.addEventListener('click', function () { irA(i, true); });
      li.appendChild(boton);
      listaDots.appendChild(li);
      return boton;
    });

    /** Desplazamiento suave propio: permite controlar la duración. */
    function deslizarHasta(destino, duracion) {
      if (prefersReducedMotion || !duracion) { viewport.scrollLeft = destino; return; }

      var inicio = viewport.scrollLeft;
      var delta  = destino - inicio;
      if (!delta) return;

      var t0 = null;
      animando = true;

      function paso(ahora) {
        if (t0 === null) t0 = ahora;
        var p = Math.min(1, (ahora - t0) / duracion);
        // easeInOutCubic: arranque y frenada suaves
        var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        viewport.scrollLeft = inicio + delta * e;
        if (p < 1) { window.requestAnimationFrame(paso); }
        else { animando = false; }
      }
      window.requestAnimationFrame(paso);
    }

    function pintar() {
      elActual.textContent = dosDigitos(indice + 1);
      puntos.forEach(function (b, i) {
        b.setAttribute('aria-current', i === indice ? 'true' : 'false');
      });
    }

    function irA(i, esManual) {
      indice = (i + diapos.length) % diapos.length;
      deslizarHasta(indice * viewport.clientWidth, esManual ? MANUAL : DESLIZA);
      pintar();
      if (esManual) arrancar();   // reinicia la cuenta atrás
    }

    // --- Avance automático ---
    function enPausa() {
      return pausaPuntero || pausaFoco || document.hidden ||
             document.body.classList.contains('is-locked');
    }
    function arrancar() {
      detener();
      if (prefersReducedMotion) return;
      temporizador = window.setInterval(function () {
        if (!enPausa()) irA(indice + 1, false);
      }, INTERVALO);
    }
    function detener() {
      if (temporizador) { window.clearInterval(temporizador); temporizador = null; }
    }

    // Pausa mientras el cursor está encima
    carrusel.addEventListener('mouseenter', function () { pausaPuntero = true; });
    carrusel.addEventListener('mouseleave', function () { pausaPuntero = false; });

    // Pausa sólo con foco de teclado: un clic de ratón en una flecha o un punto
    // no debe dejar el carrusel detenido para siempre.
    carrusel.addEventListener('focusin', function (e) {
      try { pausaFoco = e.target.matches(':focus-visible'); }
      catch (err) { pausaFoco = true; }
    });
    carrusel.addEventListener('focusout', function () { pausaFoco = false; });

    btnPrev.addEventListener('click', function () { irA(indice - 1, true); });
    btnNext.addEventListener('click', function () { irA(indice + 1, true); });

    // Flechas del teclado cuando el foco está dentro del carrusel
    carrusel.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); irA(indice - 1, true); }
      if (e.key === 'ArrowRight') { e.preventDefault(); irA(indice + 1, true); }
    });

    // Sincroniza el indicador cuando el visitante desliza con el dedo
    var esperaScroll = null;
    viewport.addEventListener('scroll', function () {
      if (animando) return;
      window.clearTimeout(esperaScroll);
      esperaScroll = window.setTimeout(function () {
        var ancho = viewport.clientWidth || 1;
        var i = Math.round(viewport.scrollLeft / ancho);
        i = Math.min(diapos.length - 1, Math.max(0, i));
        if (i !== indice) { indice = i; pintar(); }
      }, 120);
    }, { passive: true });

    // Al cambiar el ancho, recolocar la diapositiva activa
    var esperaResize = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(esperaResize);
      esperaResize = window.setTimeout(function () {
        viewport.scrollLeft = indice * viewport.clientWidth;
      }, 150);
    }, { passive: true });

    pintar();
    arrancar();
  })();

  /* ========================================================================
     07. LIGHTBOX DE FOTOGRAFÍAS
     ======================================================================== */
  (function initLightbox() {
    var lightbox = $('#lightbox');
    var imagen   = $('#lightboxImg');
    var pie      = $('#lightboxCaption');
    var btnPrev  = $('.lightbox-prev', lightbox);
    var btnNext  = $('.lightbox-next', lightbox);
    var origenes = $$('[data-lightbox]');
    if (!lightbox || !imagen || !origenes.length) return;

    // Índice de fotografías construido desde el DOM
    var fotos = origenes.map(function (el) {
      return {
        src: el.getAttribute('data-lightbox'),
        caption: el.getAttribute('data-caption') || '',
        alt: (el.querySelector('img') && el.querySelector('img').alt) || ''
      };
    });

    var indice = 0;
    var ultimoFoco = null;

    function pintar(i) {
      indice = (i + fotos.length) % fotos.length;
      var foto = fotos[indice];
      imagen.src = foto.src;
      imagen.alt = foto.alt;
      pie.textContent = foto.caption;   // textContent: contenido tratado como texto
    }

    function abrir(i, disparador) {
      ultimoFoco = disparador || document.activeElement;
      pintar(i);
      lightbox.hidden = false;
      window.requestAnimationFrame(function () { lightbox.classList.add('is-open'); });
      scrollLock.on();
      window.setTimeout(function () { $('.lightbox-close', lightbox).focus(); }, 60);
    }

    function cerrar() {
      lightbox.classList.remove('is-open');
      window.setTimeout(function () { lightbox.hidden = true; imagen.src = ''; }, 280);
      scrollLock.off();
      if (ultimoFoco && typeof ultimoFoco.focus === 'function') ultimoFoco.focus();
    }

    origenes.forEach(function (el, i) {
      el.addEventListener('click', function () { abrir(i, el); });
    });

    $$('[data-close-lightbox]', lightbox).forEach(function (el) {
      el.addEventListener('click', cerrar);
    });

    btnPrev.addEventListener('click', function () { pintar(indice - 1); });
    btnNext.addEventListener('click', function () { pintar(indice + 1); });

    document.addEventListener('keydown', function (e) {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') cerrar();
      else if (e.key === 'ArrowLeft')  pintar(indice - 1);
      else if (e.key === 'ArrowRight') pintar(indice + 1);
      else if (e.key === 'Tab') trapFocus(lightbox, e);
    });
  })();


  /* ========================================================================
     08. ANIMACIONES DE ENTRADA
     ======================================================================== */
  (function initReveal() {
    var elementos = $$('.reveal');
    if (!elementos.length) return;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      elementos.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entradas, obs) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add('is-visible');
        obs.unobserve(entrada.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    elementos.forEach(function (el) { observer.observe(el); });
  })();

})();
