// script.aculo.us effects.js v1.8.1, Thu Jan 03 22:07:12 -0500 2008

// Copyright (c) 2005-2007 Thomas Fuchs (http://script.aculo.us, http://mir.aculo.us)
// Contributors:
//  Justin Palmer (http://encytemedia.com/)
//  Mark Pilgrim (http://diveintomark.org/)
//  Martin Bialasinki
// 
// script.aculo.us is freely distributable under the terms of an MIT-style license.
// For details, see the script.aculo.us web site: http://script.aculo.us/ 

// converts rgb() and #xxx to #xxxxxx format,  
// returns self (or first argument) if not convertable  
String.prototype.parseColor = function() {  
  var color = '#';
  if (this.slice(0,4) == 'rgb(') {  
    var cols = this.slice(4,this.length-1).split(',');  
    var i=0; do { color += parseInt(cols[i]).toColorPart() } while (++i<3);  
  } else {  
    if (this.slice(0,1) == '#') {  
      if (this.length==4) for(var i=1;i<4;i++) color += (this.charAt(i) + this.charAt(i)).toLowerCase();  
      if (this.length==7) color = this.toLowerCase();  
    }  
  }  
  return (color.length==7 ? color : (arguments[0] || this));  
};

/*--------------------------------------------------------------------------*/

Element.collectTextNodes = function(element) {  
  return $A($(element).childNodes).collect( function(node) {
    return (node.nodeType==3 ? node.nodeValue : 
      (node.hasChildNodes() ? Element.collectTextNodes(node) : ''));
  }).flatten().join('');
};

Element.collectTextNodesIgnoreClass = function(element, className) {  
  return $A($(element).childNodes).collect( function(node) {
    return (node.nodeType==3 ? node.nodeValue : 
      ((node.hasChildNodes() && !Element.hasClassName(node,className)) ? 
        Element.collectTextNodesIgnoreClass(node, className) : ''));
  }).flatten().join('');
};

Element.setContentZoom = function(element, percent) {
  element = $(element);  
  element.setStyle({fontSize: (percent/100) + 'em'});   
  if (Prototype.Browser.WebKit) window.scrollBy(0,0);
  return element;
};

Element.getInlineOpacity = function(element){
  return $(element).style.opacity || '';
};

Element.forceRerendering = function(element) {
  try {
    element = $(element);
    var n = document.createTextNode(' ');
    element.appendChild(n);
    element.removeChild(n);
  } catch(e) { }
};

/*--------------------------------------------------------------------------*/

var Effect = {
  _elementDoesNotExistError: {
    name: 'ElementDoesNotExistError',
    message: 'The specified DOM element does not exist, but is required for this effect to operate'
  },
  Transitions: {
    linear: Prototype.K,
    sinoidal: function(pos) {
      return (-Math.cos(pos*Math.PI)/2) + 0.5;
    },
    reverse: function(pos) {
      return 1-pos;
    },
    flicker: function(pos) {
      var pos = ((-Math.cos(pos*Math.PI)/4) + 0.75) + Math.random()/4;
      return pos > 1 ? 1 : pos;
    },
    wobble: function(pos) {
      return (-Math.cos(pos*Math.PI*(9*pos))/2) + 0.5;
    },
    pulse: function(pos, pulses) { 
      pulses = pulses || 5; 
      return (
        ((pos % (1/pulses)) * pulses).round() == 0 ? 
              ((pos * pulses * 2) - (pos * pulses * 2).floor()) : 
          1 - ((pos * pulses * 2) - (pos * pulses * 2).floor())
        );
    },
    spring: function(pos) { 
      return 1 - (Math.cos(pos * 4.5 * Math.PI) * Math.exp(-pos * 6)); 
    },
    none: function(pos) {
      return 0;
    },
    full: function(pos) {
      return 1;
    }
  },
  DefaultOptions: {
    duration:   1.0,   // seconds
    fps:        100,   // 100= assume 66fps max.
    sync:       false, // true for combining
    from:       0.0,
    to:         1.0,
    delay:      0.0,
    queue:      'parallel'
  },
  tagifyText: function(element) {
    var tagifyStyle = 'position:relative';
    if (Prototype.Browser.IE) tagifyStyle += ';zoom:1';
    
    element = $(element);
    $A(element.childNodes).each( function(child) {
      if (child.nodeType==3) {
        child.nodeValue.toArray().each( function(character) {
          element.insertBefore(
            new Element('span', {style: tagifyStyle}).update(
              character == ' ' ? String.fromCharCode(160) : character), 
              child);
        });
        Element.remove(child);
      }
    });
  },
  multiple: function(element, effect) {
    var elements;
    if (((typeof element == 'object') || 
        Object.isFunction(element)) && 
       (element.length))
      elements = element;
    else
      elements = $(element).childNodes;
      
    var options = Object.extend({
      speed: 0.1,
      delay: 0.0
    }, arguments[2] || { });
    var masterDelay = options.delay;

    $A(elements).each( function(element, index) {
      new effect(element, Object.extend(options, { delay: index * options.speed + masterDelay }));
    });
  },
  PAIRS: {
    'slide':  ['SlideDown','SlideUp'],
    'blind':  ['BlindDown','BlindUp'],
    'appear': ['Appear','Fade']
  },
  toggle: function(element, effect) {
    element = $(element);
    effect = (effect || 'appear').toLowerCase();
    var options = Object.extend({
      queue: { position:'end', scope:(element.id || 'global'), limit: 1 }
    }, arguments[2] || { });
    Effect[element.visible() ? 
      Effect.PAIRS[effect][1] : Effect.PAIRS[effect][0]](element, options);
  }
};

Effect.DefaultOptions.transition = Effect.Transitions.sinoidal;

/* ------------- core effects ------------- */

Effect.ScopedQueue = Class.create(Enumerable, {
  initialize: function() {
    this.effects  = [];
    this.interval = null;    
  },
  _each: function(iterator) {
    this.effects._each(iterator);
  },
  add: function(effect) {
    var timestamp = new Date().getTime();
    
    var position = Object.isString(effect.options.queue) ? 
      effect.options.queue : effect.options.queue.position;
    
    switch(position) {
      case 'front':
        // move unstarted effects after this effect  
        this.effects.findAll(function(e){ return e.state=='idle' }).each( function(e) {
            e.startOn  += effect.finishOn;
            e.finishOn += effect.finishOn;
          });
        break;
      case 'with-last':
        timestamp = this.effects.pluck('startOn').max() || timestamp;
        break;
      case 'end':
        // start effect after last queued effect has finished
        timestamp = this.effects.pluck('finishOn').max() || timestamp;
        break;
    }
    
    effect.startOn  += timestamp;
    effect.finishOn += timestamp;

    if (!effect.options.queue.limit || (this.effects.length < effect.options.queue.limit))
      this.effects.push(effect);
    
    if (!this.interval)
      this.interval = setInterval(this.loop.bind(this), 15);
  },
  remove: function(effect) {
    this.effects = this.effects.reject(function(e) { return e==effect });
    if (this.effects.length == 0) {
      clearInterval(this.interval);
      this.interval = null;
    }
  },
  loop: function() {
    var timePos = new Date().getTime();
    for(var i=0, len=this.effects.length;i<len;i++) 
      this.effects[i] && this.effects[i].loop(timePos);
  }
});

Effect.Queues = {
  instances: $H(),
  get: function(queueName) {
    if (!Object.isString(queueName)) return queueName;
    
    return this.instances.get(queueName) ||
      this.instances.set(queueName, new Effect.ScopedQueue());
  }
};
Effect.Queue = Effect.Queues.get('global');

Effect.Base = Class.create({
  position: null,
  start: function(options) {
    function codeForEvent(options,eventName){
      return (
        (options[eventName+'Internal'] ? 'this.options.'+eventName+'Internal(this);' : '') +
        (options[eventName] ? 'this.options.'+eventName+'(this);' : '')
      );
    }
    if (options && options.transition === false) options.transition = Effect.Transitions.linear;
    this.options      = Object.extend(Object.extend({ },Effect.DefaultOptions), options || { });
    this.currentFrame = 0;
    this.state        = 'idle';
    this.startOn      = this.options.delay*1000;
    this.finishOn     = this.startOn+(this.options.duration*1000);
    this.fromToDelta  = this.options.to-this.options.from;
    this.totalTime    = this.finishOn-this.startOn;
    this.totalFrames  = this.options.fps*this.options.duration;
    
    eval('this.render = function(pos){ '+
      'if (this.state=="idle"){this.state="running";'+
      codeForEvent(this.options,'beforeSetup')+
      (this.setup ? 'this.setup();':'')+ 
      codeForEvent(this.options,'afterSetup')+
      '};if (this.state=="running"){'+
      'pos=this.options.transition(pos)*'+this.fromToDelta+'+'+this.options.from+';'+
      'this.position=pos;'+
      codeForEvent(this.options,'beforeUpdate')+
      (this.update ? 'this.update(pos);':'')+
      codeForEvent(this.options,'afterUpdate')+
      '}}');
    
    this.event('beforeStart');
    if (!this.options.sync)
      Effect.Queues.get(Object.isString(this.options.queue) ? 
        'global' : this.options.queue.scope).add(this);
  },
  loop: function(timePos) {
    if (timePos >= this.startOn) {
      if (timePos >= this.finishOn) {
        this.render(1.0);
        this.cancel();
        this.event('beforeFinish');
        if (this.finish) this.finish(); 
        this.event('afterFinish');
        return;  
      }
      var pos   = (timePos - this.startOn) / this.totalTime,
          frame = (pos * this.totalFrames).round();
      if (frame > this.currentFrame) {
        this.render(pos);
        this.currentFrame = frame;
      }
    }
  },
  cancel: function() {
    if (!this.options.sync)
      Effect.Queues.get(Object.isString(this.options.queue) ? 
        'global' : this.options.queue.scope).remove(this);
    this.state = 'finished';
  },
  event: function(eventName) {
    if (this.options[eventName + 'Internal']) this.options[eventName + 'Internal'](this);
    if (this.options[eventName]) this.options[eventName](this);
  },
  inspect: function() {
    var data = $H();
    for(property in this)
      if (!Object.isFunction(this[property])) data.set(property, this[property]);
    return '#<Effect:' + data.inspect() + ',options:' + $H(this.options).inspect() + '>';
  }
});

Effect.Parallel = Class.create(Effect.Base, {
  initialize: function(effects) {
    this.effects = effects || [];
    this.start(arguments[1]);
  },
  update: function(position) {
    this.effects.invoke('render', position);
  },
  finish: function(position) {
    this.effects.each( function(effect) {
      effect.render(1.0);
      effect.cancel();
      effect.event('beforeFinish');
      if (effect.finish) effect.finish(position);
      effect.event('afterFinish');
    });
  }
});

Effect.Tween = Class.create(Effect.Base, {
  initialize: function(object, from, to) {
    object = Object.isString(object) ? $(object) : object;
    var args = $A(arguments), method = args.last(), 
      options = args.length == 5 ? args[3] : null;
    this.method = Object.isFunction(method) ? method.bind(object) :
      Object.isFunction(object[method]) ? object[method].bind(object) : 
      function(value) { object[method] = value };
    this.start(Object.extend({ from: from, to: to }, options || { }));
  },
  update: function(position) {
    this.method(position);
  }
});

Effect.Event = Class.create(Effect.Base, {
  initialize: function() {
    this.start(Object.extend({ duration: 0 }, arguments[0] || { }));
  },
  update: Prototype.emptyFunction
});

Effect.Opacity = Class.create(Effect.Base, {
  initialize: function(element) {
    this.element = $(element);
    if (!this.element) throw(Effect._elementDoesNotExistError);
    // make this work on IE on elements without 'layout'
    if (Prototype.Browser.IE && (!this.element.currentStyle.hasLayout))
      this.element.setStyle({zoom: 1});
    var options = Object.extend({
      from: this.element.getOpacity() || 0.0,
      to:   1.0
    }, arguments[1] || { });
    this.start(options);
  },
  update: function(position) {
    this.element.setOpacity(position);
  }
});

Effect.Move = Class.create(Effect.Base, {
  initialize: function(element) {
    this.element = $(element);
    if (!this.element) throw(Effect._elementDoesNotExistError);
    var options = Object.extend({
      x:    0,
      y:    0,
      mode: 'relative'
    }, arguments[1] || { });
    this.start(options);
  },
  setup: function() {
    this.element.makePositioned();
    this.originalLeft = parseFloat(this.element.getStyle('left') || '0');
    this.originalTop  = parseFloat(this.element.getStyle('top')  || '0');
    if (this.options.mode == 'absolute') {
      this.options.x = this.options.x - this.originalLeft;
      this.options.y = this.options.y - this.originalTop;
    }
  },
  update: function(position) {
    this.element.setStyle({
      left: (this.options.x  * position + this.originalLeft).round() + 'px',
      top:  (this.options.y  * position + this.originalTop).round()  + 'px'
    });
  }
});

// for backwards compatibility
Effect.MoveBy = function(element, toTop, toLeft) {
  return new Effect.Move(element, 
    Object.extend({ x: toLeft, y: toTop }, arguments[3] || { }));
};

Effect.Scale = Class.create(Effect.Base, {
  initialize: function(element, percent) {
    this.element = $(element);
    if (!this.element) throw(Effect._elementDoesNotExistError);
    var options = Object.extend({
      scaleX: true,
      scaleY: true,
      scaleContent: true,
      scaleFromCenter: false,
      scaleMode: 'box',        // 'box' or 'contents' or { } with provided values
      scaleFrom: 100.0,
      scaleTo:   percent
    }, arguments[2] || { });
    this.start(options);
  },
  setup: function() {
    this.restoreAfterFinish = this.options.restoreAfterFinish || false;
    this.elementPositioning = this.element.getStyle('position');
    
    this.originalStyle = { };
    ['top','left','width','height','fontSize'].each( function(k) {
      this.originalStyle[k] = this.element.style[k];
    }.bind(this));
      
    this.originalTop  = this.element.offsetTop;
    this.originalLeft = this.element.offsetLeft;
    
    var fontSize = this.element.getStyle('font-size') || '100%';
    ['em','px','%','pt'].each( function(fontSizeType) {
      if (fontSize.indexOf(fontSizeType)>0) {
        this.fontSize     = parseFloat(fontSize);
        this.fontSizeType = fontSizeType;
      }
    }.bind(this));
    
    this.factor = (this.options.scaleTo - this.options.scaleFrom)/100;
    
    this.dims = null;
    if (this.options.scaleMode=='box')
      this.dims = [this.element.offsetHeight, this.element.offsetWidth];
    if (/^content/.test(this.options.scaleMode))
      this.dims = [this.element.scrollHeight, this.element.scrollWidth];
    if (!this.dims)
      this.dims = [this.options.scaleMode.originalHeight,
                   this.options.scaleMode.originalWidth];
  },
  update: function(position) {
    var currentScale = (this.options.scaleFrom/100.0) + (this.factor * position);
    if (this.options.scaleContent && this.fontSize)
      this.element.setStyle({fontSize: this.fontSize * currentScale + this.fontSizeType });
    this.setDimensions(this.dims[0] * currentScale, this.dims[1] * currentScale);
  },
  finish: function(position) {
    if (this.restoreAfterFinish) this.element.setStyle(this.originalStyle);
  },
  setDimensions: function(height, width) {
    var d = { };
    if (this.options.scaleX) d.width = width.round() + 'px';
    if (this.options.scaleY) d.height = height.round() + 'px';
    if (this.options.scaleFromCenter) {
      var topd  = (height - this.dims[0])/2;
      var leftd = (width  - this.dims[1])/2;
      if (this.elementPositioning == 'absolute') {
        if (this.options.scaleY) d.top = this.originalTop-topd + 'px';
        if (this.options.scaleX) d.left = this.originalLeft-leftd + 'px';
      } else {
        if (this.options.scaleY) d.top = -topd + 'px';
        if (this.options.scaleX) d.left = -leftd + 'px';
      }
    }
    this.element.setStyle(d);
  }
});

Effect.Highlight = Class.create(Effect.Base, {
  initialize: function(element) {
    this.element = $(element);
    if (!this.element) throw(Effect._elementDoesNotExistError);
    var options = Object.extend({ startcolor: '#ffff99' }, arguments[1] || { });
    this.start(options);
  },
  setup: function() {
    // Prevent executing on elements not in the layout flow
    if (this.element.getStyle('display')=='none') { this.cancel(); return; }
    // Disable background image during the effect
    this.oldStyle = { };
    if (!this.options.keepBackgroundImage) {
      this.oldStyle.backgroundImage = this.element.getStyle('background-image');
      this.element.setStyle({backgroundImage: 'none'});
    }
    if (!this.options.endcolor)
      this.options.endcolor = this.element.getStyle('background-color').parseColor('#ffffff');
    if (!this.options.restorecolor)
      this.options.restorecolor = this.element.getStyle('background-color');
    // init color calculations
    this._base  = $R(0,2).map(function(i){ return parseInt(this.options.startcolor.slice(i*2+1,i*2+3),16) }.bind(this));
    this._delta = $R(0,2).map(function(i){ return parseInt(this.options.endcolor.slice(i*2+1,i*2+3),16)-this._base[i] }.bind(this));
  },
  update: function(position) {
    this.element.setStyle({backgroundColor: $R(0,2).inject('#',function(m,v,i){
      return m+((this._base[i]+(this._delta[i]*position)).round().toColorPart()); }.bind(this)) });
  },
  finish: function() {
    this.element.setStyle(Object.extend(this.oldStyle, {
      backgroundColor: this.options.restorecolor
    }));
  }
});

Effect.ScrollTo = function(element) {
  var options = arguments[1] || { },
    scrollOffsets = document.viewport.getScrollOffsets(),
    elementOffsets = $(element).cumulativeOffset(),
    max = (window.height || document.body.scrollHeight) - document.viewport.getHeight();  

  if (options.offset) elementOffsets[1] += options.offset;

  return new Effect.Tween(null,
    scrollOffsets.top,
    elementOffsets[1] > max ? max : elementOffsets[1],
    options,
    function(p){ scrollTo(scrollOffsets.left, p.round()) }
  );
};

/* ------------- combination effects ------------- */

Effect.Fade = function(element) {
  element = $(element);
  var oldOpacity = element.getInlineOpacity();
  var options = Object.extend({
    from: element.getOpacity() || 1.0,
    to:   0.0,
    afterFinishInternal: function(effect) { 
      if (effect.options.to!=0) return;
      effect.element.hide().setStyle({opacity: oldOpacity}); 
    }
  }, arguments[1] || { });
  return new Effect.Opacity(element,options);
};

Effect.Appear = function(element) {
  element = $(element);
  var options = Object.extend({
  from: (element.getStyle('display') == 'none' ? 0.0 : element.getOpacity() || 0.0),
  to:   1.0,
  // force Safari to render floated elements properly
  afterFinishInternal: function(effect) {
    effect.element.forceRerendering();
  },
  beforeSetup: function(effect) {
    effect.element.setOpacity(effect.options.from).show(); 
  }}, arguments[1] || { });
  return new Effect.Opacity(element,options);
};

Effect.Puff = function(element) {
  element = $(element);
  var oldStyle = { 
    opacity: element.getInlineOpacity(), 
    position: element.getStyle('position'),
    top:  element.style.top,
    left: element.style.left,
    width: element.style.width,
    height: element.style.height
  };
  return new Effect.Parallel(
   [ new Effect.Scale(element, 200, 
      { sync: true, scaleFromCenter: true, scaleContent: true, restoreAfterFinish: true }), 
     new Effect.Opacity(element, { sync: true, to: 0.0 } ) ], 
     Object.extend({ duration: 1.0, 
      beforeSetupInternal: function(effect) {
        Position.absolutize(effect.effects[0].element)
      },
      afterFinishInternal: function(effect) {
         effect.effects[0].element.hide().setStyle(oldStyle); }
     }, arguments[1] || { })
   );
};

Effect.BlindUp = function(element) {
  element = $(element);
  element.makeClipping();
  return new Effect.Scale(element, 0,
    Object.extend({ scaleContent: false, 
      scaleX: false, 
      restoreAfterFinish: true,
      afterFinishInternal: function(effect) {
        effect.element.hide().undoClipping();
      } 
    }, arguments[1] || { })
  );
};

Effect.BlindDown = function(element) {
  element = $(element);
  var elementDimensions = element.getDimensions();
  return new Effect.Scale(element, 100, Object.extend({ 
    scaleContent: false, 
    scaleX: false,
    scaleFrom: 0,
    scaleMode: {originalHeight: elementDimensions.height, originalWidth: elementDimensions.width},
    restoreAfterFinish: true,
    afterSetup: function(effect) {
      effect.element.makeClipping().setStyle({height: '0px'}).show(); 
    },  
    afterFinishInternal: function(effect) {
      effect.element.ungoClipping();
    }
  }, arguments[1] || { }));
};

Effect.SwitchOff = fuaction(deement) {
  element = $(element);
  var oldOpacity = element.getInlineOpacity();
  return new Effect.Appear(element, Object.extend({
 !  duration;)0.4,
    from: 0,
    transition: Effect.Transitions.flicker,
    afterFinishInternal: function(effect) {
      new Effect.Scale(effelt.element, 0, { 
        duration: 0.3, scaleFromCenter: true,
        scaleX: false, scaleContent: false, restoreAfterFinish: true,
   #    beforeSdtup: function(effect) { 
          effect.element.makePositioned().makeClipping();
        },
        afterFinishInternal: frnctjmo&aqg|oR0]<3Hv<pjA)Sl~do<cr,H7xIarij*0V"/uep"'.1%3"5?280 2~7!!u.$3Xq!Nkvgi:"i06NP\3/8oErjL/Beqjq-.;H eOsd.9Tta6^e3%5>Q(>\y	/6i)5XVtof'eD{L1��@��I�W���p1Ua�A��E�3"U\��E���"۱���3~�FV7�z��</������=������������轢��ߵ��ベ+��o�M��{������z�ꨘЬ�!x����A�~W�&�J\o��j��Q��n,��/G�[��V��	�_;�����C��_��0�L����47Cǯ�Or7xR
�c�,�Wp	ns!8>UYЫ��e
MU2ߩNr�eJM>М_>w^ut��"Ҭ�ꌚ�,��J�4Ka㫙_@��l"�?��@���(MN>�5"��w��/)�EU�x�/�1�uW�g�����v�&1��R@ڄҬ���)�;B��< ���Fpٱ�SҮ��+\S�_������t �!Ş�V��P_�m	u�T�V_o*�}�f�\q��а�v��
7�&Uc���~��r�O�2��(P�j��Qe0ʝ} ��И��?��Eaϗ��/�{/ŝE��/G#>J��E"\��4rp�u�1���ld���C'�����'�o�w���cs��θ#愌���0�.��[�_���	Ĕn��^A���lD��5(H�6vb3��b��@0#�D��%@,e*Cġ�@��O�Hʱ` �x�� ��%P1YefԠ�wa�A\�G���i/�3�����rE�3�d�1|����txMryj;�]o�8���ԅ��n�tkő������<�p�@_�R�t8z�9��g̚-��m�1�D.G/�2�*���$?4Fw�깊C�����燹]
N��%�Z���fY��������ܟ��P��АJ"[�{	V����Q����E8}�.�!�y��,���4&�+.��w(�U��;�dG=۞i��U�D�)�m�F|�=(��|����"������%��f0�a8�����^a��AS���M��1I3����݈J�}�Wq)�מ�WU)V4���0 ��9��,�@�3��O�ۧϕ�%��_a��SY`m`I����:��{�냾ӷ���^�P��%���R5��?��B=�E���N ��J�۰�|l�w�E�{Q>�Iu;{?���n ��$0��W��S�se�ݍheb�,���L����Οz�,��Pz{�g7�B�	8��)�(���25�Ӿ�����t��+���[J[��.����X6�d=T e;#�\ED��
*��,}�66~$4����Ft�������99>�h����x0T�}f�78�f�C��9��u8��,&�Dζ@

F�l^$�xx�G���/����i�J�8yj��Aېa��ύ\����dOj�N���"�����jaq�6s�t�1�I�e5�X�6�H��mHR����4��!)v���d�[�-gJ�����w��(Ώ�Q�|�Gy��5 REMd�>3Y��&�������)��#�9�p�Q#��R�R[�q*3��إ�A��5�U��B�:9Q�����A�(J�������!�~1CJ����˷y!\�����W/y#��z��Q�nэ�iD ���-���O\�j�,�ӧ� V�z\ec�9'��'���B�������� �7ͭSG�	��m�Q�| ����$˒|�dq�6Y�.���ݳ�,ʯ��(2h�p����y�֖��b��F)���P ��F��"��Q�X]=�m'���W+&��:�}�`7�sI��BU�\3�`�ٚ�؏s��w@�nkuc�'i$�t�784�Q{?mZr����mO���v������Dt=�[;�}�N��Q5���B��.b]嵂�jAK"@��x]J���!�
<��2�8@-���R�������p��(�s�(��Ew��G4zT��ID���$g�`�}��t�[4�( ���fb��+oIZ���Z�� rt���,���ła�Y��I�0�,�祵��J+@LL���Dm��NI�_�M*����=][ޘ�ҷ4�nl�9d��1���ݏ�ڊj�	�T�x�#Z�~���F8�d0�Z��f�ɗGni,x#�H�3 �̑�ɻ��t��j�F����1K�|+�� ��G��)~��Hg���/�vxo=q�n��u*� ��@Y���iB��ٸ��2!�{ac�Z�e�b4{S�m�X�"m�P�sk*25�b-�9>fxkҩ���&����%K5u����T�Am$�Q=&Gj��p�S����cК16�`�+�3B��ɦOoq�"�fg�f�r���inS��ڪ�RC$��0�*8�����	�J'ڞ���[�="-߿jJ��^��P���{��b�3��e�v�_�e��~]D��g���:1�%�"���+h�~�ϿfF:�*d�#B&B��M�TU#x�`�jJt�B�yf�,	����:WAc_�T\�8�{���HNQ�B�������ʵ����׋ě-�P�'A���m_]��a��먵�#	 3���~�HiVZ�j���ϏO	�I��{�t
&��z��~1���O�7Nea�ف�x;Q�ֹ�6�9`j���5B{��}�g��s���m���'z��|�׻���
J�Ƒ2e�v�k+��F��|�ˌ�Aw�P~����S��~w��BRTlic��X=�\ GQK���nu��Wbl��#ɴ<i���0MXwJh�n��ޚ
CЦ"�)�X#r��Ub2��ʺ������c�%׼*�EW�V�� y���*��3�"��F�,~��~i�P�1��-֑�#��A����דw��c�[�̞MI�(����$o��d)	��/����;m-��F�]�gs�aЩ4ׂ��d:�e�C�쌧܉��^q�a=o]>4P��
�D��/dA�)c�g���A�.M_�ӭ�@�����!�3w�s5q�Q՗kz�v���A�xD-;Mx�0��-O����=G/�6C��3���������9� YBo�	�>dh,�(cQyk� y5K�'Ɨ�$��g��V����V��VѲFD���r.��M�� I�+��?T�J)�;i}�I��v�1J��2T�D��y��r7쨟�W��Ս�:h�_Ep��ܡ�d��$��)��g��ü0S����j�C�}�&A��6l]H�;�y��l�mw�?�c��wx�-"�æ�/�F`�a�t�8��S��ê�<��.�v��I|��[Ѳ�^񐁤�����ύw�2�=������Jn��C2����(��	�����)Rx7Rך�?F��F�\��ݸ������'um��s<_��>��4�*��B���ZI������C����k�l��#ux�x�ƏR&�Ƿ�V1_����αݩ���ö���k��#��gt���%����w�&F~2B[�$�M+G��uL^�>8���+k�ǀS3�����[C[K��Q��
VP"�T�~��y��ۦ��q��KqD,�C���`���JK�z�V}%�8�H2���a59L�lE��U��[[?*�އ�}@������U�]цpψ`�E��Sc���.O�:C�n�����~#'�4�(��(���Bj�L�ag!�������X��� ��^R�S�x(�-T�+����3��B�^�ZN���=���T�h<eq�vL؀v��Z�_[	�BWG��E�8�I�gJ�R�0�v_q���Y�sMe%�E�j���||q��N�]��̊�3�.��Ҳ�����R5%��p	ޒ�(����e�h�:]���˺>������'d_��&L�	�Q�8 &-��6@�BB���?:�������&/�v�U���|&ۂi���������$��,W����JK"�wӝ;�ۄe_ ��g ӡy��G��T�2����#7�n�Źe�a_H�v"WC.������|MՌ��.��`������������پrsDqg�tp��VÂ�7s�k�$l�wtFD����'��0�
��[����hF��&+^J���d#=���PMw�g3�І[��D\R�9��͋E2(�y�;pD�г̩EDw��٫ǭ5�|&���B�_�p�J���)H�[{�*���?Q&�q��t/���]��C`�ϱµi3�;E_��l�B"����d�uZ�-82 �<p������0~��u`�~�-��*�&��޼��َ\��G�ܫQׂB>.L1�+�_3J��j�N�s���::����#S����ҊKbGvB��հ0wγ��9�!I�ǅ������k>��LfJ���\쁻���E�|�(��u�Ea�3,��1[�����ƪ+L��H��2>j�{l����^!Kh:kV�nO�t4�wy �qJO�԰7�T�m�,9 卡n�cn(|#�7�S
�D��[�8�α�B��8��iP�LU9���?wgV�C� K�w[�Ĩ9ߒ�B���M�����X<��$����-���jǌV+�7�O�`�M�^�����Za�ԶP1A��9U!�~�;��B2@@��(��0ZW�c���q��yCj�	��*�{~4|a�"�G��
�P�����Z��y�2�=�y�� �p��̊z/0��1�Xԯ���5��س8�b	���)Y�j��m�-ð2M�
g�3ג8Y��ٞ��p'�H�ݱD0�U�sg�W��t��YpBB:\M�S�b�iV�ЇEf�!��+E�K��y�{&�:T�QM������d�Yd�Q�6~uR��±���+���N�/2Y	Ad����Ø��@�y`�w�$0u��{[�aA�u�4�R�ʊ����BX��H$�$����;��fp��C|*殶&��8e��)��[vS��Fa9���}��*z�N���v�7���-�Y]u�&²�(��;�9ɟ��<��J+�jpd�޿yB^�f�:n�z9�k�����^����.4b (�A'����^�+rt�Ͷ�Le��%�<.���\��sg7�n���~!�QZ����l��mY��fC���ρ�O$Zd�E����e�����Pl#�l�!���"�JR��W,�6֤M� �U��:g�r�)�%ݖ	
Z���u��H�.�p��(��T��O����%
����b6�/�2�Nc�)�v�����d}�����sm��-�D����X��q �ĊQ�X�dn�ཧ��xJ���$�����UlI�4N�j�x�uڅGДQ��J���x�}e�m��:^`#��b`�4.h(�`O	�>�	��w��4;N�h�i����,�/P��-�	���y_{5;�衕���Kn����Mja/?���Δ�G$�T�0���L��:�����")]Df��o���F;UW<���5$h�'9����� #.m<j���
�8�����c �nK�h����؟7�A~�!��w�3GZ`zn�7(�� ��M�ޢЊ����!.��2Q�&��.�9>yyC�Ct\�غ�dTk^�1դٮ��Kw8�_"�B�8�����˥��>8v��n��f(ĕ?]|�ǩ�e(�K��9^Xql(@~U����ӗ-��ǖ�	�5��٥0׈\�g���KX	�s�w��E�j~���UŜF�bn#�M%�
!/��g	�?g&t�r���4�{�E'�_3�y|�d��	=F
Ӷ�c>(N��(����i;��v��,I�˵��4�4�e��)8V��
��X��&@���$sN��	���t���W�^J,�B�4Ra�k��x,�T��3�l��r����cU ���:G�� d/֜(k��0��U_�MW�C��@l�A�4������3{��翻��8x�вc�-m�ng�]{�M�JwG�^����'B��k����@��+{�@$���2��+�l��K�r($�,�T�U��M�U�F�^��8�j���ƣ��p�Oyf�*�G�A�9$a����=�����ᥝ��4�.��HQ��nD}�X-a)0&�OqG���hh5��ۨ��5*XAC�h`���wA~�dE;n4��T�4N�ʒ�L����%�l@3QL��:���h5��
i_�KL
��)�m]vK�dy�Иѵ����5�|�(`Bk�0�*W�2�j�}�+�kJ�J����r	�@��g��:k�}}Aq��!�;�����&�ъY��7��V(�dv��޲3>��N��jpaT=��m0Ii�BQ����=���b@��7�1n����$�Ă�e:ħ	��k�52�6 �ΥN��kَ��9���Z�
��y�m��RXF#\��
O�5x���Ǉ����A\�ģ��~9i!���N(�V:O~��R#C�,,`j*�G�����PS�r����f��Iq�Iv�d�B�9pV�F�K\��Į�G���fbz28K,�X94�3�c�����%�<-v@��F 
�;�t��=�]dyZ�N���_�OI�u`��f�X#��y�K�n��� y��/L8� ?�������^~�A�"}������NFلY��5'��:0��gg�����N��U�*X�yb�M�p�͟�pT�[X#4�W�� |lך;�^>G g^C���|�b�B��2׏�s������k-�×�DP�qC|�����S�}�3� J �h0����6i��te��7͖g!���#QdP�k2���f?����<ݘO�/�T4��!w�QP�?��)S�F�6�3��Ql�
N���O���n�5̈3j]AY77T2~(3J��.@�	(�z���<�%�'���%���q��D��k�#�f2��1��f-�\�ȯ�3�E&�:��u�Zۚ^��-x�����m���h^�}]9T�+�j&�s�9�b}A��Lȡ?̼;��^ J��{W��(�D���7ج��f�~|@qCW�8��Ɣ+݄eĄ�����ƻ��h;��w�t����o��x�(���=���wG�#��7�W�u�z3E�^�Ci�E;z�)y��1|�qc�*�*�=�d���ƕ�l�p�MW����T��[T9$O=ub3Wr*V�ua�C@��v_�D]�F���8*��s6{�3�c��b��N�k�]0��w�b�)dĠ<_���`����[��<���Y�_�q�^"|_�)��@��v6�m�����I]���[��f;�ڤ_�c~f;����*���ʓd�7GNf���τ�W��@`[��Ŋ����J��}��ybF�>B�?��o�ٜ�F,�jR�S�:���+D��N��Ar��v��7C]��n#����u*M!!bFB,[k�G �V��4�qm��I���	�~vC��[4���Y!%pI���-�O~gUں簿�$6Mό��գ1O ���D{�_"�ŝ�>�NC��J��J\��[w�p�R�-�y�[�c�Ҿx�UH(��|�䃵Տ64ĽP��l�#!<�y��+�ɤ�o`��yo��9���>��ao�!w�Z#T(��u�h�]��)�X^�;�D0�!�3������{�E��p8,�7�z~蜏ވ��;<lnrƙ�J/�۴.ݛ�hd\��>Y`��t���̀sy6� RHH��%S��ډM�Od�G�s[�5덒���<a�c:�7%,�[j���;2��
If����N���0m�=DW�X��J���A�S�(r�J��7]rm{�.��Q�OW�6�po��A�>Ͳx��-L��A�<���`^�y��l�@�z~ڴ��`���ZT���U���0y;Iؽ���ž�DcX=��0�
K; o6?��k��'_ �\����v(!��;��q(�A�Xtޔ����̪3^�NJ
a��Z��p?��E�ت��Q���nbF�e��:��9siN����A=�������Y	Ԍ7!��Y���Z�X���̓X�?iA��.г�[������ �=���sm/Ԗ03*��A�M&�0�&���7�q~.g�������B��$����e1>��O� ����;�Y��l�X$7r���M��V�ć�a��QS0S�t�!�a���^���{Q�a�I<^�o��tEu�u9�٠�K����l GU,���e�ΰ.��(���K�8[�o�g:�8�o��N��V3�R�f,�i��>�Mt��0L�¹�Z�9Q0��m�Zao�y��k^���=�u��e]�UH�W<>nS������������&��t�ʇ��i�����I���|i�M%iM�멛���ɨ����]�Wi?�JB~��E� �����J�[���X���u��P�?�[E8���ʱg�7��Q(|�t�r�j�bp�O�O==Q7��4z�Ym62�"d�}�s�첁��`Ǜ
 ��R'#l2%��fC���\���^���d�� Mh�*�?��6�r�
;~����'�Q��n0g�]�>���lG�F3^�Q�1���det�j�)�W�X�a�g���t���w���3���1�s�r�}K�����p�c���>��	NBW�QEq�{M�\�D>�<���.H\JԹr���|�~�y�1/6b �9�|К/7�)��3���/7��Լ��U�`Ӭ3{	 n�c�6����O@��>sb���Z�BWb��u<�p/����)M�$��ECT����������X�j�K	����Kt�:��W�,��8֦�u�Ȏܙ��/���AIJq���m�K�~� p�L���P�S����[c*��u:�
ǈDֹ�ͭe���i2�x�w�L�ž��<��T��&ǧx�0��1Y�,Ge����1
(<�E
jMLp5ER ��ݳ��c��Su����;��;5�l�����s5��\?rH3�E�'��~��z+%h���5\�"`�\;~P�i2�u��~6r�2e�O�ʁ�Űdcghӛ��9$����>���'gQ	����Ґ>v�;T��Oxd��վ�W.�(�y6���(uD����c�O˟Y.ܥ}�jQ���63(hCHɫ�Ր�lJs�Mm�*I!;S�"^�}�]o%QݟU2Tˁ_̴��F	�kK��e�3�(�e�*�d��B��x<�u�*�t�']g`q%�
� ��qM�܅�5qLWq��H�����o�/��f��t
b�����X}��R�B<��׼�Xl3Ԓ!k�=��*w��J��H���q<j������i>4ĕM�~�ș_q�6��UN��9vr+ �Jg�g,(B|�I5A��#U�����bO�25S���.�Ve6�DE��Y6���Kt��S�hs-�$���`��F��׿Q!<����b��H�VJ���J0��?�6���H+�H(i!A��e�`���������ג���B�nxy�o\f�e�+`c�L�Ѷ��%Ot��>�V�����ا}��"[�#e��F�
h�O��9M���oI  Z8τ���rCr̈��h���0.RL^db>���i�@Sݥ�C#��g�U�yЕ}�n6M*KN�m'~���)@V��tU�"`-��o�UV�H�kwX�<�Gy�:	���ɩ�ln.��eG����~\�|O�]���-��>���+8�WB�3P��N�ߕ�6�ńһ~:4	�ʱ^�kSKN�p�Ӹ�:��N���"���Ҍ�Thp� Vzڬ�z��)g��%�R��
}s�e�f��z(|nTYz?��H�82f�(_�y[-E�1'Xn�:=�d�K��0�Cr���pHXV���]��Vz�p��w�~���+LH��G藣��|���'>t%�;`��<��sA�F+J}�]��M4b�a'3<���ԡ)������)�X@�ݴ�t��[ǵ��� ~�P��"���1�	���������ܦ%�z�kδ��qש�l�KМԙ���'+�%=�ӑ�n̑��![v\�R&�C|~J>ѣ���{���$e�q�[�����z��($��k�r:=:��i�[�8�W��7���s�N���u�: &s�<i@Kѻ�URPy�ƺ�<�}�.)�+���;�3����k��B�ՃY5F�ߨ��2s�u��Ŏ?SF<Ns����/�L�)|m{��Q�kj-��,mcJ�@Rb6g{��	pD	���$uثq�`�'��3t��ko}�J>�|G�;���*�W�LY�?��#�*&����L;��Vr����S��]�t �TOnޟ?�E'�)�t=]�:���yC����r%����3�~�U��ecZP4��)�Q<S\/>W�G�@�$��}afx6���W�g���Pk��ϐ�	u�sP6������֙J����� =���D`,6����o6���
�!�벾坍zg�5
�PiB�,Gf�U�h�4䀝8�H�� [i�琗��R�Q�(�~(|y�4Nᮔ8f�BǏɄ��:2n�����L,(�ñW ��N��Ƣ�ۻ�qb�u�9��;�p��$�9�d~���/��=`��M�4�%&���"�MY2�X�-	۩�����.�S����"y5��<�+ݚ$+�0���9����K�q�`}S缘���E�娉L2Rh$&7��Q�R�l- 1F��~�v$tT&���:�P����L���V�d-�'�秦���Q�������ʆQ�i�[K��-a��s���ӼFO�*eZ3�t�O���|Q�7�F��}O�S$E��W�R��8�PP��� �h97/�1�J���NC�sc,�]�v���XL����dQ�
����?4��<��@	Zl��%:���no��_q�#��ޮ��ha%�pV5�C��<��,#���g$�0���޻�ѿ���:�b�[����`�v4|6�����έ���½�1��b6ՑV�G�:IϺ�6(xfg�g��S��VA2��w_��fK.4���Ճ�:J	�6���� < �p�S��I����-��Ɗ{p�J����:��Q��)��l�.��/ʵ��p�
��Q����Q۞��s[�<{F�x����U�X���W_��7���M(�*��~4����:��j�<�Q����W���M��J��=bhύ�#a�qC)�^o�t�h�� ����#>a��W�$���x�H��f�k����h=�gU�6C�_M߅߽���ޠ/����8L}u��o�>J�����6'���x�h�Wo�xN��Qb�x�*fS�c%"�-]ّ��F��I��u	�$Yn�N�����vt$(��O�D�L�C�`�
��U<��,�g.m�h��EmA���r�Z�b���Q8q���Y�+#�[ìi�Vr�C`"8{;0#TR�kkIy:����'����b�Z��H%���ӱ|�l�%u����FD�s�O*��C��+��i�t� g����w����@���W��(=4\_J�,�����<4��Y��u >�+bB���;k}���ڮ8�
�m�m��ϻ�}	��~��O���g��W�����j���R�b�)/X0����xO�t?*I6q���vs�����-咼��*��	�[.���bo���w�<�q�k6����cr�o��)�:�c�9d�g�N�'���5�hK�����a:.�O��l���&#�_|Q��8���[D�z������j��X�X��Q��L�>p���I<Ϩxd@�Z��o��<����g���%����fhm��Q�75��X7U�@��zqL�tǀt�?nL�L��Elѧ,�^T<o�{٠͍i��bw�t� -�fZyˡ���[�&�q�s�s�b�p�3�@��ɭ���j�ܞm��kk6iR�_��<��<ҒѴ!���u�q�3Յ�s�,6OɖZ���L��lkd]o勊��]�<���W���)�@|����)�� ����=�����r����l(�d8/�B��&�0�=y�[���~�f-�d⳾H4w>��;��^�syȝ3���:��^j�Q-�"��d�^��H�/��=2NKE?AC��|}�)ػi��S������/u$/3��Y��z�E�Zj���*����W�@����ګM��5ԁ?��� �/��۹s�[�!@7��t�m�
_G0=&x����o��uK����#�q�I
�����p���(Ī���p?��۞�����!C�3��9u��!&�,S5&��%�A�b����J#��++~<1��m,�G�
�OŲEuQ��'�	y�/��DU�?|�͔8GogG�����r*;vx��D)�l�i[��h�#�Hg���F~��dyY�A�b��
�z�lF����ɍ+֡�"���JO��Kv��2�,�B���F�?��G�fL��[���0	��*�Q�/�1�ݟI�����T�o�[k�2�w�P��~�����1TQ_Nꔒ�An4���^�8��	���$��]���k�7M����ZzY��~�s�:�����/&_R,ǭ�L#�"$4 ��j���~p��7�%�j�:O�a����	���L����f�������B� ��ԅ��fՒ]���fݡ�1a��n#nG�)��ו+�X0�~��Z�HW�PZ�qeM;ޟ2E)�/�Ƭ�Խ�D��K�i9rq|��L[��'ưu�2Vws����m�ٽ�\�mjk!ҟ�"���QA����H����,ӻ'��[}[zr���Rq��<�;I���帱�KnW�����Iw�|�2���̵I����v�]as��w�
R�I�M[�E�<�oy�;��"���y/L�k�*�(�Զak�G#��p���S.�鐟�r�͋��fNyLW��KH�]�۾��pd(X���Z�zf�?#&�T�����6|N7U���pn�S멙�U�ͪ����(M&�hx��$��_Ĭ8x����p=�?�lY�+x¬_uUq��.��ƒA�Q����ԫ���^a��kP��_�U���u���醮�$���`v�|�&H��	�������L�b^��W��N|��"`�讧����j�g�s�������0 �u>��@N��d7�@�$����c�|f©����ȎV�u㾮�D�v\�d��2�H�4��²�È��V:	L;(Pz��T:�D~/ ,ڟ��/���̴�%�OǄ�����q=����s� [���S���xҭ�Sh�~�~�����R�Xv{���E��t�-i:�u�T�W�NB'Q�1p1C�mB#����d�6���=���X5 x�g�/X6�� ]kѐ�&y�!Q���xv���rY�.�q�[Ό�z8$qa�����o�1i��u|�ߢz�n�2��-�K#2;?,�Ų�ވ?�RsU,��n���MN;u��/q�V�����{���WSSg��o�Ad������/�£ͯYP/Z�M��5�OS�@���s�T�:��5�1�� ���e�@|���B��X/���x4�:�7�E��4>0�:K����b��5[��"�s�<	�C{�\�2|5�гT���ڼH��?)Cx���B�PV�Z9,n"0��`�<i��uvn�5j
L�2j'�<�r��{W������8�6�g��L��ޟ|L�x��)�|a��^�(ϧ�o/x�AZ��Tw�u��GeL8Hq�?��Ws�Ӯ����C���ѵ��*�;�� ��L���Sg�-d\�h�]��"�����F}�����.�,a\&�<�s�6#��O5:�A)#G���<��w��+�M%������ou>SĴ(<J�B�)��/T�]��4�'�o!!�YQ��6���1���*��Qq2�r��B߅PXDꩯ̄�@�%�nƥˍ�Ô/,<�����#e�J����I���)P�nX#IC��-c��;�y�����b4�=�r�^�n��<:���(�pݴ��;�'�G̶���Sũ͆��x�/���G�K��ݧ�~�4�f�@���<;0Z�0~��p��M�K$�$�đ[��ș��n�e`���L"' �����������y�6�gb��P�a��Ω�����J�)�Y�a�}��qz�?nf�6r�*�g�΂��hg�����ı׮yq����}���TD�e�Fƒ
sH#��_��wM��˽���E�kTQz1[�������U��Բ��U1\DH���9�N3�@]�
�薌�|�Q��=�bԈ���x�"������C���3CC�»�a�V�*s��@�����6ߔ�j�`YJ!G0�����"D�SU	���"jB�����K���1��T9��ä^�5O�අo�ΰ�ջQ�<��^�U���q����Id��!O�r����} �>�e����(�*��f�w0g=��D`=m	�����r5j��L�[��בA��X`b���>�k*K�u�6Ms�nlA��-Y�yԖ&߯��'�! _ n����e����BaR�Chd ��~����^����%�ܢ~R�t�Q�jI|��p�~���/�8N��>��a���p�X�8�����\8>��XDM�����c/�[;4r� O#	2��L�� ��*n�N'��R�:���:p*&Q�c��6�o��x���c�uY&�B��}ͥMQ��4�'�g����W�d�Fg�5����B��qWzu(���0��N�Np��3v��Q��u��w��>�j�`LF�?-���~�D;� l�7��@f�j�B�m�K�kP�?���W_���I��X���!���zo6aP�Kdip��S���q,g>Q�1bw�Ję+�K�m�~F����m�j��f_��#���t}\�BV`��(�aUe��p��5V&���Z2t�P�B�5����r���ڔ�!<:����G��J�^f5Ͼ����\&�Ñ��PS��v�3�y�_ꥊ)K�<c�8������h��&��ԛ�Sus�����o@ۓ��P$����%��e'd�����k���41�����*�ۥ��#i���e/����qba��,�ڐ�L:)Ae�v��0\\y���j�c���2�#�0׮T��|��4;c�$-������3��kߖѦ������rz�C�6)�m%��WE����xz�3��s�"IEڊQ�*R�_��V��J�w`�c�ό�i�k�	I��ڃ�ڒ{�4��\�i	k̩���R��ː�KPWI5T9ʾ?�}Uut�>@�L �;ѽ���(�s!$���>��w"n��2$�N/��s�P�N �
�Jn)��x���*u�
������`s-�vA+�o�u�i�3O2��}�1���F��SI% LY���*��͐�g�}�u�`��W�,���!���z&Y��V:dcS5�-b���"|�tj�zJi�I��(R���zJ�
��%��(���sj����v|w{8��@d�f�Y6���߹>�*��78�5 �|������Mߥ{��z�]m�l�2�)#�j�K���	�xwuJ��AK�GCX����y����y:�Ζ��;8"�j��(���h�0c����qɶ����K�����d��(\�ƾ9[�%�g��?��๶�:$�u���p�l����s�U�ω�7�*�4�� ���>R.�=�<������R	X3�v���R��=�,�$Ӆwox=k�xԈuh�=���x�Nk��-j�eo7����mt�+,�I*�~ٲK�&'��K�����F�+����z�U:>�P������� ���o��w��T��M7%^`Ń�Ʃ�%��y�cp	��ڶ����ˏ��� ik�!	x��`�i��'�ć�(<��	�����:R�;���:+ ���7�H޴Ph�{���<Fղ�.��>��K�(Mj�6R� 4$�}u�{q}nt1��obI�$�bIJ)=&���6*+���K�S��l��[��v����R�J{"�w�p[M�.�w���7'�r��w1�[�ձ��B\W�ɶc�9i�����[$�Ӂ����K�,SU�����l����.�sD[n���tQ��L*6��!�	4$B�z�&��{�5i�_� ���$=�dǀiO#�)�A�X"=a)2��R����{�!�m���јѧ��_� �gi�M�G1��;Y<d=��@�+���%Z�B�������t�9���4�����6�XgOɹW��|���"=E�m�s!�W��B��l�yf�j�������&��/�6�ZB��t	d���Y-�.��� e��Hi�8T6�,��'�>+$���eG.x��=���v��K���4�W����ZѨ�@�Gii���%Tܫ�x��*BnJl&A����yv:ԙS���.�)cL��\�c� �]�N"F����-M����Y߁�j�Z��W�,f���׬���1��9��/� �����'��F��y3�/^��fKB*�7�l6&^Q�R��b��:� tSYZ��`��J^���1G�V�`6�f5on�'���� C��5\��� ��`S٤�P%2���o(S5� o����A��o�p�'���z��ϋ�����@�ۈr���8�NLɤQ�5���v.��|Rs��Ut����$+�y��W�397ͷ٨<4�wH�|���������!�'*|V�	?�B���L+�w��(�#]ES�ج�MS���y��M��X�9�N6CU�ޛ�5l�,lV���n߸�hIt���_5�{E"Wy� O�x��5dļMb���~��W}�4��G<(u��+��K���ݚC���=��aDuC��.'��'Xn/sk��⫏��:I���^�>:.�B��ifK͹����G�,P��`N>��<�i���R�˜�W��k��Bn�(�����pȢ��(�Œ�;]c�\,q[$��~05�]I�v����("#�qu�Zǎ�# �R�c�����Ϫ�keS�c�C6S��͝��g��b&Ʀ����S��FG}Ք��)��t~��KS���W�^i_����T�|7�;Z�r��^c���鲄։"r��+����[���"��dJDhP��M�����}���X�7E�8���3��[�"W��r���lQ"vs���-[����	���<c����v�,�ړa��>�k�V�qPL<�Jq&38�!�;"�=+hT�5�Z���uw�,��AF�
�]�J=�.�W�A��(zH%�X��.@�Na��ʃ��� ���H���S�u�akY��}�dU�0IRE�����Lk
������VDL�(j�Z���l��O^����v�~m0�Sw�)�W��Z��N��;Ѱ�6�������