import pickle
import tensorflow as tf
from tensorflow.keras.layers import Layer
import tensorflow.keras.backend as K

_model = None
_label_encoder = None

class Attention(Layer):
    def build(self, input_shape):
        self.W = self.add_weight(
            name="att_weight",
            shape=(input_shape[-1], 1),
            initializer="glorot_uniform",
            trainable=True,
        )
        self.b = self.add_weight(
            name="att_bias",
            shape=(input_shape[1], 1),
            initializer="zeros",
            trainable=True,
        )
        super().build(input_shape)

    def call(self, x):
        e = K.tanh(K.dot(x, self.W) + self.b)
        a = K.softmax(e, axis=1)
        return K.sum(x * a, axis=1)

def get_model_and_encoder():
    global _model, _label_encoder
    if _model is None or _label_encoder is None:
        _model = tf.keras.models.load_model(
            "model/esc50_crnn_model.h5",
            custom_objects={"Attention": Attention},
        )
        with open("model/label_encoder.pkl", "rb") as f:
            _label_encoder = pickle.load(f)
    return _model, _label_encoder
