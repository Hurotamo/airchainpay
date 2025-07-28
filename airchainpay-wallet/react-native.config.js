module.exports = {
  dependencies: {
    'react-native-ble-plx': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-ble-plx/android',
          packageImportPath: 'import com.polidea.rxandroidble2.RxBleClient;',
          packageInstance: 'RxBleClient.create(this)'
        },
        ios: {
          sourceDir: '../node_modules/react-native-ble-plx/ios',
          podspecPath: '../node_modules/react-native-ble-plx/react-native-ble-plx.podspec'
        }
      }
    },
    'tp-rn-ble-advertiser': {
      platforms: {
        android: {
          sourceDir: '../node_modules/tp-rn-ble-advertiser/android',
          packageImportPath: 'import com.tulparyazilim.ble.BleAdvertiserModule;',
          packageInstance: 'new BleAdvertiserModule(reactContext)'
        },
        ios: {
          sourceDir: '../node_modules/tp-rn-ble-advertiser/ios',
          podspecPath: '../node_modules/tp-rn-ble-advertiser/tp-rn-ble-advertiser.podspec'
        }
      }
    }
  }
}; 