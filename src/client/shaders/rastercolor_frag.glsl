#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D text;
varying vec2 texCoord;

void main(void)
{
    vec4 color = texture2D(text, texCoord);
     // blending equation
    gl_FragColor= vec4(color.r,color.r,color.r,1.0);
}